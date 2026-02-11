"""In-memory store for rooms and messages.

Drop-in replacement for DynamoDB. All data lives in dicts, lost on restart.
Interface is async so the DynamoDB implementation can be swapped in later.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

from google.protobuf.timestamp_pb2 import Timestamp

from pb.api.room import room_pb2


@dataclass
class StoredRoom:
    room_id: str
    name: str
    created_at: datetime
    created_by: str
    llms: list[room_pb2.LLMConfig]
    description: str = ""
    visibility: room_pb2.RoomVisibility.ValueType = room_pb2.ROOM_VISIBILITY_PUBLIC


@dataclass
class StoredMessage:
    message_id: str
    room_id: str
    sender_id: str
    sender_name: str
    sender_type: room_pb2.ParticipantType.ValueType
    content: str
    reply_to: Optional[str]
    timestamp: datetime
    # sort key for cursor pagination (matches DynamoDB SK format)
    sort_key: str
    poll_id: Optional[str] = None  # If set, this message is a poll


@dataclass
class StoredParticipant:
    user_id: str
    room_id: str
    display_name: str
    role: room_pb2.Role.ValueType
    joined_at: datetime
    title: str = ""
    avatar: str = ""  # emoji avatar


@dataclass
class StoredPollVote:
    voter_id: str
    voter_name: str
    reason: str
    voted_at: datetime


@dataclass
class StoredPollOption:
    id: str
    text: str
    description: str
    votes: list[StoredPollVote] = field(default_factory=list)


@dataclass
class StoredPoll:
    poll_id: str
    room_id: str
    creator_id: str
    creator_name: str
    creator_type: room_pb2.ParticipantType.ValueType
    question: str
    options: list[StoredPollOption]
    allow_multiple: bool
    anonymous: bool
    status: room_pb2.PollStatus.ValueType
    created_at: datetime
    closed_at: Optional[datetime] = None
    mandatory: bool = False  # If true, LLMs must vote


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _dt_to_ts(dt: datetime) -> Timestamp:
    ts = Timestamp()
    ts.FromDatetime(dt)
    return ts


def _make_sort_key(dt: datetime, msg_id: str) -> str:
    epoch_ms = int(dt.timestamp() * 1000)
    return f"MSG#{epoch_ms}#{msg_id}"


class MemoryStore:
    def __init__(self) -> None:
        self._rooms: dict[str, StoredRoom] = {}
        # room_id → list of messages (append-only, sorted by time)
        self._messages: dict[str, list[StoredMessage]] = {}
        # (room_id, user_id) → participant
        self._participants: dict[tuple[str, str], StoredParticipant] = {}
        # user_id → set of room_ids
        self._user_rooms: dict[str, set[str]] = {}
        # poll_id → poll
        self._polls: dict[str, StoredPoll] = {}
        # room_id → list of poll_ids (chronological)
        self._room_polls: dict[str, list[str]] = {}

    async def create_room(
        self,
        name: str,
        created_by: str,
        llms: list[room_pb2.LLMConfig],
        description: str = "",
        visibility: room_pb2.RoomVisibility.ValueType = room_pb2.ROOM_VISIBILITY_PUBLIC,
    ) -> str:
        room_id = uuid.uuid4().hex[:12]
        self._rooms[room_id] = StoredRoom(
            room_id=room_id,
            name=name,
            created_at=_now(),
            created_by=created_by,
            llms=list(llms),
            description=description,
            visibility=visibility,
        )
        self._messages[room_id] = []
        return room_id

    async def get_room(self, room_id: str) -> Optional[StoredRoom]:
        return self._rooms.get(room_id)

    async def list_rooms(
        self,
        user_id: Optional[str] = None,
        limit: int = 20,
        cursor: Optional[str] = None,
    ) -> tuple[list[StoredRoom], Optional[str]]:
        if user_id:
            room_ids = self._user_rooms.get(user_id, set())
            rooms = [self._rooms[rid] for rid in room_ids if rid in self._rooms]
        else:
            rooms = list(self._rooms.values())

        # Filter out private rooms that don't belong to the requesting user
        # Private rooms are only visible to their creator (in room list)
        rooms = [
            r
            for r in rooms
            if r.visibility != room_pb2.ROOM_VISIBILITY_PRIVATE
            or r.created_by == user_id
        ]

        rooms.sort(key=lambda r: r.created_at, reverse=True)

        # cursor is a room_id; skip until we find it
        start = 0
        if cursor:
            for i, r in enumerate(rooms):
                if r.room_id == cursor:
                    start = i + 1
                    break

        page = rooms[start : start + limit]
        next_cursor = page[-1].room_id if len(page) == limit else None
        return page, next_cursor

    async def add_participant(
        self,
        room_id: str,
        user_id: str,
        display_name: str,
        role: room_pb2.Role.ValueType,
        title: str = "",
        avatar: str = "",
    ) -> StoredParticipant:
        key = (room_id, user_id)
        if key in self._participants:
            # Update display name on rejoin
            self._participants[key].display_name = display_name
            self._participants[key].role = role
            self._participants[key].title = title
            self._participants[key].avatar = avatar
        else:
            self._participants[key] = StoredParticipant(
                user_id=user_id,
                room_id=room_id,
                display_name=display_name,
                role=role,
                joined_at=_now(),
                title=title,
                avatar=avatar,
            )
            self._user_rooms.setdefault(user_id, set()).add(room_id)
        return self._participants[key]

    async def update_room_description(
        self, room_id: str, description: str
    ) -> Optional[StoredRoom]:
        """Update a room's description. Returns updated room or None if not found."""
        room = self._rooms.get(room_id)
        if not room:
            return None
        room.description = description
        return room

    async def add_llm(self, room_id: str, llm: room_pb2.LLMConfig) -> bool:
        """Add an LLM to a room. Returns False if room not found."""
        room = self._rooms.get(room_id)
        if not room:
            return False
        # Avoid duplicates
        if any(l.id == llm.id for l in room.llms):
            return False
        room.llms.append(llm)
        return True

    async def update_llm(
        self,
        room_id: str,
        llm_id: str,
        model: Optional[str] = None,
        persona: Optional[str] = None,
        display_name: Optional[str] = None,
        title: Optional[str] = None,
        chat_style: Optional[int] = None,
        avatar: Optional[str] = None,
    ) -> Optional[room_pb2.LLMConfig]:
        """Update an LLM config in a room. Returns updated config or None."""
        room = self._rooms.get(room_id)
        if not room:
            return None
        for llm in room.llms:
            if llm.id == llm_id:
                if model is not None:
                    llm.model = model
                if persona is not None:
                    llm.persona = persona
                if display_name is not None:
                    llm.display_name = display_name
                if title is not None:
                    llm.title = title
                if chat_style is not None:
                    llm.chat_style = chat_style
                if avatar is not None:
                    llm.avatar = avatar
                return llm
        return None

    async def remove_llm(self, room_id: str, llm_id: str) -> bool:
        """Remove an LLM from a room. Returns True if removed."""
        room = self._rooms.get(room_id)
        if not room:
            return False
        original_len = len(room.llms)
        room.llms = [l for l in room.llms if l.id != llm_id]
        return len(room.llms) < original_len

    async def get_participants(self, room_id: str) -> list[StoredParticipant]:
        return [
            p for (rid, _), p in self._participants.items() if rid == room_id
        ]

    async def add_message(
        self,
        room_id: str,
        sender_id: str,
        sender_name: str,
        sender_type: room_pb2.ParticipantType.ValueType,
        content: str,
        reply_to: Optional[str] = None,
        poll_id: Optional[str] = None,
        message_id: Optional[str] = None,
    ) -> StoredMessage:
        msg_id = message_id or uuid.uuid4().hex[:16]
        now = _now()
        msg = StoredMessage(
            message_id=msg_id,
            room_id=room_id,
            sender_id=sender_id,
            sender_name=sender_name,
            sender_type=sender_type,
            content=content,
            reply_to=reply_to,
            timestamp=now,
            sort_key=_make_sort_key(now, msg_id),
            poll_id=poll_id,
        )
        self._messages.setdefault(room_id, []).append(msg)
        return msg

    async def load_history(
        self,
        room_id: str,
        limit: int = 50,
        cursor: Optional[str] = None,
    ) -> tuple[list[StoredMessage], Optional[str]]:
        msgs = self._messages.get(room_id, [])

        # cursor is a sort_key; find position and go backward
        end = len(msgs)
        if cursor:
            for i, m in enumerate(msgs):
                if m.sort_key == cursor:
                    end = i
                    break

        start = max(0, end - limit)
        page = msgs[start:end]
        next_cursor = page[0].sort_key if start > 0 else None
        return page, next_cursor

    def message_to_proto(self, msg: StoredMessage) -> room_pb2.Message:
        proto = room_pb2.Message(
            message_id=msg.message_id,
            sender_id=msg.sender_id,
            sender_name=msg.sender_name,
            sender_type=msg.sender_type,
            content=msg.content,
            reply_to=msg.reply_to,
            timestamp=_dt_to_ts(msg.timestamp),
        )
        if msg.poll_id:
            proto.poll_id = msg.poll_id
        return proto

    def room_to_proto(self, room: StoredRoom) -> room_pb2.RoomInfo:
        return room_pb2.RoomInfo(
            room_id=room.room_id,
            name=room.name,
            created_at=_dt_to_ts(room.created_at),
            created_by=room.created_by,
            llms=room.llms,
            description=room.description,
            visibility=room.visibility,
        )

    # ------------------------------------------------------------------
    # Poll methods
    # ------------------------------------------------------------------

    async def create_poll(
        self,
        room_id: str,
        creator_id: str,
        creator_name: str,
        creator_type: room_pb2.ParticipantType.ValueType,
        question: str,
        options: list[tuple[str, str]],  # [(text, description), ...]
        allow_multiple: bool = False,
        anonymous: bool = False,
        mandatory: bool = False,
    ) -> StoredPoll:
        poll_id = uuid.uuid4().hex[:12]
        stored_options = [
            StoredPollOption(
                id=uuid.uuid4().hex[:8],
                text=text,
                description=desc,
                votes=[],
            )
            for text, desc in options
        ]
        poll = StoredPoll(
            poll_id=poll_id,
            room_id=room_id,
            creator_id=creator_id,
            creator_name=creator_name,
            creator_type=creator_type,
            question=question,
            options=stored_options,
            allow_multiple=allow_multiple,
            anonymous=anonymous,
            status=room_pb2.POLL_OPEN,
            created_at=_now(),
            mandatory=mandatory,
        )
        self._polls[poll_id] = poll
        self._room_polls.setdefault(room_id, []).append(poll_id)
        return poll

    async def get_poll(self, poll_id: str) -> Optional[StoredPoll]:
        return self._polls.get(poll_id)

    async def list_room_polls(
        self, room_id: str, active_only: bool = True
    ) -> list[StoredPoll]:
        poll_ids = self._room_polls.get(room_id, [])
        polls = [self._polls[pid] for pid in poll_ids if pid in self._polls]
        if active_only:
            polls = [p for p in polls if p.status == room_pb2.POLL_OPEN]
        return polls

    async def add_vote(
        self,
        poll_id: str,
        option_id: str,
        voter_id: str,
        voter_name: str,
        reason: str = "",
    ) -> Optional[tuple[StoredPoll, StoredPollOption, StoredPollVote]]:
        """Add a vote. Returns (poll, option, vote) or None if not found."""
        poll = self._polls.get(poll_id)
        if not poll or poll.status != room_pb2.POLL_OPEN:
            return None

        # Find option
        option = next((o for o in poll.options if o.id == option_id), None)
        if not option:
            return None

        # Check if already voted on this option
        if any(v.voter_id == voter_id for v in option.votes):
            return None  # Already voted

        # If not allow_multiple, remove any existing votes from this voter
        if not poll.allow_multiple:
            for opt in poll.options:
                opt.votes = [v for v in opt.votes if v.voter_id != voter_id]

        vote = StoredPollVote(
            voter_id=voter_id,
            voter_name=voter_name,
            reason=reason,
            voted_at=_now(),
        )
        option.votes.append(vote)
        return poll, option, vote

    async def close_poll(self, poll_id: str) -> Optional[StoredPoll]:
        poll = self._polls.get(poll_id)
        if not poll:
            return None
        poll.status = room_pb2.POLL_CLOSED
        poll.closed_at = _now()
        return poll

    def poll_vote_to_proto(self, vote: StoredPollVote) -> room_pb2.PollVote:
        return room_pb2.PollVote(
            voter_id=vote.voter_id,
            voter_name=vote.voter_name,
            reason=vote.reason,
            voted_at=_dt_to_ts(vote.voted_at),
        )

    def poll_option_to_proto(self, option: StoredPollOption) -> room_pb2.PollOption:
        return room_pb2.PollOption(
            id=option.id,
            text=option.text,
            description=option.description,
            votes=[self.poll_vote_to_proto(v) for v in option.votes],
        )

    def poll_to_proto(self, poll: StoredPoll) -> room_pb2.Poll:
        proto = room_pb2.Poll(
            poll_id=poll.poll_id,
            room_id=poll.room_id,
            creator_id=poll.creator_id,
            creator_name=poll.creator_name,
            creator_type=poll.creator_type,
            question=poll.question,
            options=[self.poll_option_to_proto(o) for o in poll.options],
            allow_multiple=poll.allow_multiple,
            anonymous=poll.anonymous,
            status=poll.status,
            created_at=_dt_to_ts(poll.created_at),
            mandatory=poll.mandatory,
        )
        if poll.closed_at:
            proto.closed_at.CopyFrom(_dt_to_ts(poll.closed_at))
        return proto
