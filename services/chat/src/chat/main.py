from __future__ import annotations

import asyncio
import logging

import grpc

from common.logging import setup_cloudwatch_logging
from pb.api.chat import chat_pb2_grpc

from chat.config.config import load_config
from chat.providers.openrouter import OpenRouterChatProvider
from chat.server.service import ChatService

setup_cloudwatch_logging("chat-service")
logger = logging.getLogger(__name__)


async def _serve() -> None:
    config = load_config()

    server = grpc.aio.server()

    provider = OpenRouterChatProvider(config)
    servicer = ChatService(provider=provider)
    chat_pb2_grpc.add_ChatServicer_to_server(servicer, server)

    port = config.server.grpc.port
    listen_addr = f"[::]:{port}"
    server.add_insecure_port(listen_addr)

    logger.info("Starting Chat gRPC server on %s", listen_addr)
    await server.start()
    try:
        await server.wait_for_termination()
    except KeyboardInterrupt:
        logger.info("Shutting down Chat gRPC server")
        await server.stop(grace=5.0)


def main() -> None:
    asyncio.run(_serve())


if __name__ == "__main__":
    main()


