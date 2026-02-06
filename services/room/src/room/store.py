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


@dataclass
class StoredParticipant:
    user_id: str
    room_id: str
    display_name: str
    role: room_pb2.Role.ValueType
    joined_at: datetime


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

    async def create_room(
        self,
        name: str,
        created_by: str,
        llms: list[room_pb2.LLMConfig],
    ) -> str:
        room_id = uuid.uuid4().hex[:12]
        self._rooms[room_id] = StoredRoom(
            room_id=room_id,
            name=name,
            created_at=_now(),
            created_by=created_by,
            llms=list(llms),
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
    ) -> StoredParticipant:
        key = (room_id, user_id)
        if key not in self._participants:
            self._participants[key] = StoredParticipant(
                user_id=user_id,
                room_id=room_id,
                display_name=display_name,
                role=role,
                joined_at=_now(),
            )
            self._user_rooms.setdefault(user_id, set()).add(room_id)
        return self._participants[key]

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
    ) -> StoredMessage:
        msg_id = uuid.uuid4().hex[:16]
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
        return room_pb2.Message(
            message_id=msg.message_id,
            sender_id=msg.sender_id,
            sender_name=msg.sender_name,
            sender_type=msg.sender_type,
            content=msg.content,
            reply_to=msg.reply_to,
            timestamp=_dt_to_ts(msg.timestamp),
        )

    def room_to_proto(self, room: StoredRoom) -> room_pb2.RoomInfo:
        return room_pb2.RoomInfo(
            room_id=room.room_id,
            name=room.name,
            created_at=_dt_to_ts(room.created_at),
            created_by=room.created_by,
            llms=room.llms,
        )
