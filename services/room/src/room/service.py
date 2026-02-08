"""Room gRPC service implementation."""

from __future__ import annotations

import logging

import grpc

from pb.api.room import room_pb2, room_pb2_grpc

from room.config import AppConfig
from room.registry import HandlerRegistry
from room.session import StreamHandler
from room.store import MemoryStore

logger = logging.getLogger(__name__)


class RoomService(room_pb2_grpc.RoomServicer):
    def __init__(self, store: MemoryStore, config: AppConfig) -> None:
        self._store = store
        self._config = config
        self._registry = HandlerRegistry()

    # ------------------------------------------------------------------
    # Unary RPCs
    # ------------------------------------------------------------------

    async def CreateRoom(
        self,
        request: room_pb2.CreateRoomRequest,
        context: grpc.aio.ServicerContext,
    ) -> room_pb2.CreateRoomResponse:
        room_id = await self._store.create_room(
            name=request.name,
            created_by=request.created_by,
            llms=list(request.llms),
            description=request.description,
        )
        logger.info("Created room %s (%s)", room_id, request.name)
        return room_pb2.CreateRoomResponse(room_id=room_id)

    async def GetRoom(
        self,
        request: room_pb2.GetRoomRequest,
        context: grpc.aio.ServicerContext,
    ) -> room_pb2.GetRoomResponse:
        room = await self._store.get_room(request.room_id)
        if room is None:
            await context.abort(
                grpc.StatusCode.NOT_FOUND,
                f"Room {request.room_id} not found",
            )

        online_ids = self._registry.get_online_user_ids(request.room_id)
        all_participants = await self._store.get_participants(request.room_id)
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

        return room_pb2.GetRoomResponse(
            room=self._store.room_to_proto(room),
            participants=online_participants,
        )

    async def ListRooms(
        self,
        request: room_pb2.ListRoomsRequest,
        context: grpc.aio.ServicerContext,
    ) -> room_pb2.ListRoomsResponse:
        user_id = request.user_id if request.HasField("user_id") else None
        limit = request.limit or 20
        cursor = request.cursor if request.HasField("cursor") else None

        rooms, next_cursor = await self._store.list_rooms(
            user_id=user_id,
            limit=limit,
            cursor=cursor,
        )

        return room_pb2.ListRoomsResponse(
            rooms=[self._store.room_to_proto(r) for r in rooms],
            next_cursor=next_cursor,
        )

    async def LoadHistory(
        self,
        request: room_pb2.LoadHistoryRequest,
        context: grpc.aio.ServicerContext,
    ) -> room_pb2.LoadHistoryResponse:
        room = await self._store.get_room(request.room_id)
        if room is None:
            await context.abort(
                grpc.StatusCode.NOT_FOUND,
                f"Room {request.room_id} not found",
            )

        limit = request.limit or 50
        cursor = request.cursor if request.HasField("cursor") else None

        messages, next_cursor = await self._store.load_history(
            room_id=request.room_id,
            limit=limit,
            cursor=cursor,
        )

        return room_pb2.LoadHistoryResponse(
            messages=[self._store.message_to_proto(m) for m in messages],
            next_cursor=next_cursor,
        )

    # ------------------------------------------------------------------
    # Bidi streaming
    # ------------------------------------------------------------------

    async def RoomSession(
        self,
        request_iterator,
        context: grpc.aio.ServicerContext,
    ) -> None:
        handler = StreamHandler(
            context=context,
            store=self._store,
            registry=self._registry,
            chat_service_address=self._config.chat_service.address,
        )
        await handler.run(request_iterator)
