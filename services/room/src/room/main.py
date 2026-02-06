from __future__ import annotations

import asyncio
import logging
import signal

import grpc

from pb.api.room import room_pb2_grpc

from room.config import load_config
from room.service import RoomService
from room.store import MemoryStore

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


async def _serve() -> None:
    config = load_config()
    store = MemoryStore()
    servicer = RoomService(store=store, config=config)

    server = grpc.aio.server()
    room_pb2_grpc.add_RoomServicer_to_server(servicer, server)

    listen_addr = f"[::]:{config.server.grpc_port}"
    server.add_insecure_port(listen_addr)

    await server.start()
    logger.info("Room service listening on %s", listen_addr)

    shutdown = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, shutdown.set)

    await shutdown.wait()
    logger.info("Shutting down room service...")
    await server.stop(grace=5.0)


def main() -> None:
    asyncio.run(_serve())


if __name__ == "__main__":
    main()
