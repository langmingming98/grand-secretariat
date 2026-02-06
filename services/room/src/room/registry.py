"""Handler registry: maps room_id → set of active stream handlers.

Single-instance replacement for Redis pub/sub. When we scale, this becomes
a local registry that receives events from a Redis subscriber instead of
direct dispatch.
"""

from __future__ import annotations

import logging
from collections import defaultdict
from typing import TYPE_CHECKING

from pb.api.room import room_pb2

if TYPE_CHECKING:
    from room.session import StreamHandler

logger = logging.getLogger(__name__)


class HandlerRegistry:
    def __init__(self) -> None:
        self._handlers: dict[str, set[StreamHandler]] = defaultdict(set)

    def register(self, room_id: str, handler: StreamHandler) -> None:
        self._handlers[room_id].add(handler)
        logger.info(
            "Registered handler for user %s in room %s (total: %d)",
            handler.user_id,
            room_id,
            len(self._handlers[room_id]),
        )

    def unregister(self, room_id: str, handler: StreamHandler) -> None:
        self._handlers[room_id].discard(handler)
        if not self._handlers[room_id]:
            del self._handlers[room_id]
        logger.info(
            "Unregistered handler for user %s in room %s",
            handler.user_id,
            room_id,
        )

    async def broadcast(self, room_id: str, event: room_pb2.ServerEvent) -> None:
        """Send an event to all handlers in a room."""
        handlers = list(self._handlers.get(room_id, set()))
        for handler in handlers:
            await handler.enqueue(event)

    async def broadcast_except(
        self,
        room_id: str,
        event: room_pb2.ServerEvent,
        exclude_user_id: str,
    ) -> None:
        """Send an event to all handlers except the specified user."""
        handlers = list(self._handlers.get(room_id, set()))
        for handler in handlers:
            if handler.user_id != exclude_user_id:
                await handler.enqueue(event)

    def get_online_user_ids(self, room_id: str) -> set[str]:
        return {h.user_id for h in self._handlers.get(room_id, set())}
