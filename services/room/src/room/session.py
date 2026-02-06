"""Bidi stream handler: one per user per RoomSession stream.

Manages the async read/write loops on the gRPC stream and dispatches
client messages to the service layer.
"""

from __future__ import annotations

import asyncio
import logging
import re
from typing import TYPE_CHECKING, Optional

import grpc

from pb.api.chat import chat_pb2, chat_pb2_grpc
from pb.api.room import room_pb2
from pb.shared import content_pb2

if TYPE_CHECKING:
    from room.registry import HandlerRegistry
    from room.store import MemoryStore

logger = logging.getLogger(__name__)

_MENTION_RE = re.compile(r"@(\w+)")


class StreamHandler:
    def __init__(
        self,
        context: grpc.aio.ServicerContext,
        store: MemoryStore,
        registry: HandlerRegistry,
        chat_service_address: str,
    ) -> None:
        self._context = context
        self._store = store
        self._registry = registry
        self._chat_address = chat_service_address
        self._outbound: asyncio.Queue[room_pb2.ServerEvent] = asyncio.Queue()
        self._room_id: Optional[str] = None
        self._user_id: Optional[str] = None
        self._display_name: Optional[str] = None
        self._role: room_pb2.Role.ValueType = room_pb2.ROLE_UNSPECIFIED

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
                elif payload == "ping":
                    await self.enqueue(
                        room_pb2.ServerEvent(pong=room_pb2.Pong())
                    )
        except asyncio.CancelledError:
            pass
        finally:
            write_task.cancel()
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
        )

        # Register handler for broadcasts
        self._registry.register(join.room_id, self)

        # Build room state
        messages, _ = await self._store.load_history(join.room_id, limit=50)
        online_ids = self._registry.get_online_user_ids(join.room_id)
        all_participants = await self._store.get_participants(join.room_id)

        # Online human participants
        online_participants = [
            room_pb2.Participant(
                id=p.user_id,
                name=p.display_name,
                role=p.role,
                type=room_pb2.HUMAN,
            )
            for p in all_participants
            if p.user_id in online_ids
        ]

        room_state = room_pb2.RoomState(
            room=self._store.room_to_proto(room),
            participants=online_participants,
            messages=[self._store.message_to_proto(m) for m in messages],
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
            await self._dispatch_mentions(
                send.content,
                list(send.mentions),
                stored.message_id,
                room,
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

    async def _handle_interrupt(self, interrupt: room_pb2.InterruptLLM) -> None:
        # TODO: cancel in-flight LLM tasks
        logger.info("Interrupt requested for LLM %s", interrupt.llm_id)

    # ------------------------------------------------------------------
    # @mention → LLM dispatch
    # ------------------------------------------------------------------

    async def _dispatch_mentions(
        self,
        content: str,
        client_mentions: list[str],
        trigger_msg_id: str,
        room,
    ) -> None:
        """Parse @mentions and fire off LLM requests for matched LLMs."""
        # Server re-validates mentions against room config
        raw_mentions = set(client_mentions) | set(_MENTION_RE.findall(content))
        llm_lookup = {
            llm.id.lower(): llm for llm in room.llms
        } | {
            llm.display_name.lower(): llm for llm in room.llms
        }

        matched_llms = []
        for mention in raw_mentions:
            llm = llm_lookup.get(mention.lower())
            if llm and llm not in matched_llms:
                matched_llms.append(llm)

        for llm_config in matched_llms:
            asyncio.create_task(
                self._call_llm(llm_config, trigger_msg_id)
            )

    async def _call_llm(
        self,
        llm_config: room_pb2.LLMConfig,
        trigger_msg_id: str,
    ) -> None:
        """Call the Chat Service for an LLM response and stream chunks back."""
        if not self._room_id:
            return

        llm_id = llm_config.id

        # Notify: LLM is thinking
        await self._registry.broadcast(
            self._room_id,
            room_pb2.ServerEvent(
                llm_thinking=room_pb2.LLMThinking(
                    llm_id=llm_id,
                    reply_to=trigger_msg_id,
                )
            ),
        )

        # Build context: recent messages for the LLM
        recent_msgs, _ = await self._store.load_history(self._room_id, limit=50)
        chat_messages = []

        # System prompt from persona
        if llm_config.persona:
            chat_messages.append(
                content_pb2.Message(
                    role=content_pb2.USER,  # Will be mapped to system by chat svc
                    contents=[content_pb2.Content(text=llm_config.persona)],
                )
            )

        # Conversation history
        for msg in recent_msgs:
            role = (
                content_pb2.ASSISTANT
                if msg.sender_type == room_pb2.LLM
                else content_pb2.USER
            )
            prefix = f"{msg.sender_name}: " if role == content_pb2.USER else ""
            chat_messages.append(
                content_pb2.Message(
                    role=role,
                    contents=[
                        content_pb2.Content(text=f"{prefix}{msg.content}")
                    ],
                )
            )

        # Generate a message_id for the LLM response
        import uuid

        response_msg_id = uuid.uuid4().hex[:16]
        full_content: list[str] = []

        try:
            channel = grpc.aio.insecure_channel(self._chat_address)
            stub = chat_pb2_grpc.ChatStub(channel)

            request = chat_pb2.ChatRequest(
                messages=chat_messages,
                models=[llm_config.model],
            )

            async for response in stub.Chat(request):
                chunk = response.delta.content
                if chunk:
                    full_content.append(chunk)
                    await self._registry.broadcast(
                        self._room_id,
                        room_pb2.ServerEvent(
                            llm_chunk=room_pb2.LLMChunk(
                                message_id=response_msg_id,
                                llm_id=llm_id,
                                content=chunk,
                                reply_to=trigger_msg_id,
                            )
                        ),
                    )

            await channel.close()
        except grpc.RpcError as e:
            logger.error("Chat service error for %s: %s", llm_id, e)
            await self._registry.broadcast(
                self._room_id,
                room_pb2.ServerEvent(
                    error=room_pb2.Error(
                        code="LLM_ERROR",
                        message=f"Error from {llm_config.display_name}: {e.details() if hasattr(e, 'details') else str(e)}",
                    )
                ),
            )
            return

        # Store the complete LLM message
        await self._store.add_message(
            room_id=self._room_id,
            sender_id=llm_id,
            sender_name=llm_config.display_name,
            sender_type=room_pb2.LLM,
            content="".join(full_content),
            reply_to=trigger_msg_id,
        )

        # Notify: LLM is done
        await self._registry.broadcast(
            self._room_id,
            room_pb2.ServerEvent(
                llm_done=room_pb2.LLMDone(
                    message_id=response_msg_id,
                    llm_id=llm_id,
                )
            ),
        )

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
