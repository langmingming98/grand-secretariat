"""Bidi stream handler: one per user per RoomSession stream.

Manages the async read/write loops on the gRPC stream and dispatches
client messages to the service layer.
"""

from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING, Optional

import grpc

from pb.api.room import room_pb2

from room.llm_dispatcher import LLMDispatcher

if TYPE_CHECKING:
    from room.registry import HandlerRegistry
    from room.store import MemoryStore

logger = logging.getLogger(__name__)


class StreamHandler:
    """Handler for a single user's room session stream.

    Each connected user has their own StreamHandler instance which manages:
    - Reading messages from the client
    - Writing events to the client
    - Dispatching @mentions to LLMs via LLMDispatcher
    """

    def __init__(
        self,
        context: grpc.aio.ServicerContext,
        store: "MemoryStore",
        registry: "HandlerRegistry",
        chat_service_address: str,
    ) -> None:
        self._context = context
        self._store = store
        self._registry = registry
        self._outbound: asyncio.Queue[room_pb2.ServerEvent] = asyncio.Queue()
        self._room_id: Optional[str] = None
        self._user_id: Optional[str] = None
        self._display_name: Optional[str] = None
        self._role: room_pb2.Role.ValueType = room_pb2.ROLE_UNSPECIFIED

        # LLM dispatch is handled by a separate class
        self._llm_dispatcher = LLMDispatcher(
            chat_service_address=chat_service_address,
            store=store,
            registry=registry,
        )

    @property
    def user_id(self) -> Optional[str]:
        return self._user_id

    @property
    def room_id(self) -> Optional[str]:
        return self._room_id

    async def enqueue(self, event: room_pb2.ServerEvent) -> None:
        await self._outbound.put(event)

    async def run(
        self,
        request_iterator,
    ) -> None:
        """Main loop: read from client + flush outbound queue concurrently."""

        async def _write_loop() -> None:
            while True:
                event = await self._outbound.get()
                await self._context.write(event)

        write_task = asyncio.create_task(_write_loop())

        try:
            async for client_msg in request_iterator:
                payload = client_msg.WhichOneof("payload")
                if payload == "join":
                    await self._handle_join(client_msg.join)
                elif payload == "message":
                    await self._handle_message(client_msg.message)
                elif payload == "typing":
                    await self._handle_typing(client_msg.typing)
                elif payload == "interrupt":
                    await self._handle_interrupt(client_msg.interrupt)
                elif payload == "add_llm":
                    await self._handle_add_llm(client_msg.add_llm)
                elif payload == "update_llm":
                    await self._handle_update_llm(client_msg.update_llm)
                elif payload == "remove_llm":
                    await self._handle_remove_llm(client_msg.remove_llm)
                elif payload == "update_room_description":
                    await self._handle_update_room_description(
                        client_msg.update_room_description
                    )
                elif payload == "create_poll":
                    await self._handle_create_poll(client_msg.create_poll)
                elif payload == "cast_vote":
                    await self._handle_cast_vote(client_msg.cast_vote)
                elif payload == "close_poll":
                    await self._handle_close_poll(client_msg.close_poll)
                elif payload == "ping":
                    await self.enqueue(
                        room_pb2.ServerEvent(pong=room_pb2.Pong())
                    )
        except asyncio.CancelledError:
            pass
        finally:
            write_task.cancel()
            await self._llm_dispatcher.cancel_pending_tasks()
            if self._room_id and self._user_id:
                self._registry.unregister(self._room_id, self)
                await self._broadcast_user_left()

    # ------------------------------------------------------------------
    # Client message handlers
    # ------------------------------------------------------------------

    async def _handle_join(self, join: room_pb2.JoinRoom) -> None:
        self._room_id = join.room_id
        self._user_id = join.user_id
        self._display_name = join.display_name
        self._role = join.role

        room = await self._store.get_room(join.room_id)
        if room is None:
            await self.enqueue(
                room_pb2.ServerEvent(
                    error=room_pb2.Error(
                        code="ROOM_NOT_FOUND",
                        message=f"Room {join.room_id} does not exist",
                    )
                )
            )
            return

        # Persist participant
        await self._store.add_participant(
            room_id=join.room_id,
            user_id=join.user_id,
            display_name=join.display_name,
            role=join.role,
            title=join.title,
            avatar=join.avatar,
        )

        # Register handler for broadcasts
        self._registry.register(join.room_id, self)

        # Build room state
        messages, _ = await self._store.load_history(join.room_id, limit=50)
        online_ids = self._registry.get_online_user_ids(join.room_id)
        all_participants = await self._store.get_participants(join.room_id)

        # All human participants with online status
        all_participants_proto = [
            room_pb2.Participant(
                id=p.user_id,
                name=p.display_name,
                role=p.role,
                type=room_pb2.HUMAN,
                title=p.title,
                is_online=p.user_id in online_ids,
                avatar=p.avatar,
            )
            for p in all_participants
        ]

        # Load active polls
        active_polls = await self._store.list_room_polls(join.room_id, active_only=True)

        room_state = room_pb2.RoomState(
            room=self._store.room_to_proto(room),
            participants=all_participants_proto,
            messages=[self._store.message_to_proto(m) for m in messages],
            polls=[self._store.poll_to_proto(p) for p in active_polls],
        )
        await self.enqueue(room_pb2.ServerEvent(room_state=room_state))

        # Notify others
        await self._registry.broadcast_except(
            join.room_id,
            room_pb2.ServerEvent(
                user_joined=room_pb2.UserJoined(
                    user=room_pb2.Participant(
                        id=join.user_id,
                        name=join.display_name,
                        role=join.role,
                        type=room_pb2.HUMAN,
                        title=join.title,
                    )
                )
            ),
            exclude_user_id=join.user_id,
        )
        logger.info(
            "User %s (%s) joined room %s",
            join.user_id,
            join.display_name,
            join.room_id,
        )

    async def _handle_message(self, send: room_pb2.SendMessage) -> None:
        if not self._room_id or not self._user_id:
            return

        # Store the message
        stored = await self._store.add_message(
            room_id=self._room_id,
            sender_id=self._user_id,
            sender_name=self._display_name or "Unknown",
            sender_type=room_pb2.HUMAN,
            content=send.content,
            reply_to=send.reply_to if send.HasField("reply_to") else None,
        )

        # Broadcast to all participants
        msg_proto = self._store.message_to_proto(stored)
        await self._registry.broadcast(
            self._room_id,
            room_pb2.ServerEvent(
                message_received=room_pb2.MessageReceived(message=msg_proto)
            ),
        )

        # Check for @mentions
        room = await self._store.get_room(self._room_id)
        if room:
            await self._llm_dispatcher.dispatch_mentions(
                room_id=self._room_id,
                content=send.content,
                client_mentions=list(send.mentions),
                trigger_msg_id=stored.message_id,
                room=room,
            )

    async def _handle_typing(self, typing: room_pb2.TypingIndicator) -> None:
        if not self._room_id or not self._user_id:
            return
        await self._registry.broadcast_except(
            self._room_id,
            room_pb2.ServerEvent(
                user_typing=room_pb2.UserTyping(
                    user_id=self._user_id,
                    user_name=self._display_name or "",
                    is_typing=typing.is_typing,
                )
            ),
            exclude_user_id=self._user_id,
        )

    async def _handle_add_llm(self, add: room_pb2.AddLLM) -> None:
        if not self._room_id:
            return
        ok = await self._store.add_llm(self._room_id, add.llm)
        if ok:
            await self._registry.broadcast(
                self._room_id,
                room_pb2.ServerEvent(
                    llm_added=room_pb2.LLMAdded(llm=add.llm)
                ),
            )
            logger.info("LLM %s added to room %s", add.llm.id, self._room_id)

    async def _handle_update_llm(self, update: room_pb2.UpdateLLM) -> None:
        if not self._room_id:
            return
        updated = await self._store.update_llm(
            room_id=self._room_id,
            llm_id=update.llm_id,
            model=update.model if update.HasField("model") else None,
            persona=update.persona if update.HasField("persona") else None,
            display_name=update.display_name if update.HasField("display_name") else None,
            title=update.title if update.HasField("title") else None,
            chat_style=update.chat_style if update.HasField("chat_style") else None,
            avatar=update.avatar if update.HasField("avatar") else None,
        )
        if updated:
            await self._registry.broadcast(
                self._room_id,
                room_pb2.ServerEvent(
                    llm_updated=room_pb2.LLMUpdated(llm=updated)
                ),
            )
            logger.info("LLM %s updated in room %s", update.llm_id, self._room_id)

    async def _handle_remove_llm(self, remove: room_pb2.RemoveLLM) -> None:
        if not self._room_id:
            return
        removed = await self._store.remove_llm(self._room_id, remove.llm_id)
        if removed:
            await self._registry.broadcast(
                self._room_id,
                room_pb2.ServerEvent(
                    llm_removed=room_pb2.LLMRemoved(llm_id=remove.llm_id)
                ),
            )
            logger.info("LLM %s removed from room %s", remove.llm_id, self._room_id)

    async def _handle_update_room_description(
        self, update: room_pb2.UpdateRoomDescription
    ) -> None:
        if not self._room_id:
            return
        room = await self._store.update_room_description(
            self._room_id, update.description
        )
        if room:
            await self._registry.broadcast(
                self._room_id,
                room_pb2.ServerEvent(
                    room_updated=room_pb2.RoomUpdated(
                        room=self._store.room_to_proto(room)
                    )
                ),
            )
            logger.info(
                "Room %s description updated by %s", self._room_id, self._user_id
            )

    async def _handle_interrupt(self, interrupt: room_pb2.InterruptLLM) -> None:
        if not self._room_id:
            return
        cancelled = await self._llm_dispatcher.cancel_llm_task(interrupt.llm_id, self._room_id)
        logger.info(
            "Interrupt requested for LLM %s: %s",
            interrupt.llm_id,
            "cancelled" if cancelled else "no active task",
        )

    async def _handle_create_poll(self, create: room_pb2.CreatePoll) -> None:
        if not self._room_id or not self._user_id:
            return

        options = [(opt.text, opt.description) for opt in create.options]
        if len(options) < 2:
            await self.enqueue(
                room_pb2.ServerEvent(
                    error=room_pb2.Error(
                        code="INVALID_POLL",
                        message="Poll must have at least 2 options",
                    )
                )
            )
            return

        # Create the poll
        poll = await self._store.create_poll(
            room_id=self._room_id,
            creator_id=self._user_id,
            creator_name=self._display_name or "Unknown",
            creator_type=room_pb2.HUMAN,
            question=create.question,
            options=options,
            allow_multiple=create.allow_multiple,
            anonymous=create.anonymous,
            mandatory=create.mandatory,
        )

        # Create a message for the poll (so it appears in chat history)
        poll_msg = await self._store.add_message(
            room_id=self._room_id,
            sender_id=self._user_id,
            sender_name=self._display_name or "Unknown",
            sender_type=room_pb2.HUMAN,
            content=create.question,
            poll_id=poll.poll_id,
        )

        # Broadcast the poll message (includes poll_id for frontend rendering)
        msg_proto = self._store.message_to_proto(poll_msg)
        await self._registry.broadcast(
            self._room_id,
            room_pb2.ServerEvent(
                message_received=room_pb2.MessageReceived(message=msg_proto)
            ),
        )

        # Also broadcast poll_created so frontend can update poll state
        await self._registry.broadcast(
            self._room_id,
            room_pb2.ServerEvent(
                poll_created=room_pb2.PollCreated(
                    poll=self._store.poll_to_proto(poll)
                )
            ),
        )
        logger.info("Poll %s created in room %s by %s", poll.poll_id, self._room_id, self._user_id)

        # Trigger all LLMs to vote on the poll
        poll_options = [
            {"id": opt.id, "text": opt.text, "description": opt.description}
            for opt in poll.options
        ]
        await self._llm_dispatcher.dispatch_poll_voting(
            room_id=self._room_id,
            poll_id=poll.poll_id,
            question=create.question,
            options=poll_options,
            mandatory=create.mandatory,
            trigger_msg_id=poll_msg.message_id,
        )

    async def _handle_cast_vote(self, vote: room_pb2.CastVote) -> None:
        if not self._room_id or not self._user_id:
            return

        # Vote on each selected option
        for option_id in vote.option_ids:
            result = await self._store.add_vote(
                poll_id=vote.poll_id,
                option_id=option_id,
                voter_id=self._user_id,
                voter_name=self._display_name or "Unknown",
                reason=vote.reason,
            )
            if result:
                poll, option, stored_vote = result
                await self._registry.broadcast(
                    self._room_id,
                    room_pb2.ServerEvent(
                        poll_voted=room_pb2.PollVoted(
                            poll_id=poll.poll_id,
                            option_id=option.id,
                            vote=self._store.poll_vote_to_proto(stored_vote),
                        )
                    ),
                )
                logger.info(
                    "Vote cast on poll %s option %s by %s",
                    vote.poll_id,
                    option_id,
                    self._user_id,
                )

    async def _handle_close_poll(self, close: room_pb2.ClosePoll) -> None:
        if not self._room_id or not self._user_id:
            return

        poll = await self._store.close_poll(close.poll_id)
        if poll:
            await self._registry.broadcast(
                self._room_id,
                room_pb2.ServerEvent(
                    poll_closed=room_pb2.PollClosed(
                        poll_id=poll.poll_id,
                        closed_by_id=self._user_id,
                        closed_by_name=self._display_name or "Unknown",
                    )
                ),
            )
            logger.info("Poll %s closed by %s", close.poll_id, self._user_id)

    async def _broadcast_user_left(self) -> None:
        if not self._room_id or not self._user_id:
            return
        # Only broadcast leave if no other handlers for this user in this room
        online = self._registry.get_online_user_ids(self._room_id)
        if self._user_id not in online:
            await self._registry.broadcast(
                self._room_id,
                room_pb2.ServerEvent(
                    user_left=room_pb2.UserLeft(user_id=self._user_id)
                ),
            )
            logger.info("User %s left room %s", self._user_id, self._room_id)
