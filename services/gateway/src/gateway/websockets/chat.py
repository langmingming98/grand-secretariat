"""Legacy WebSocket endpoint for streaming multi-model chat responses."""

import asyncio
import logging
from typing import Dict, List

import grpc.aio
from fastapi import WebSocket, WebSocketDisconnect

from pb.api.chat import chat_pb2, chat_pb2_grpc
from pb.shared import content_pb2

from gateway.config import load_config

logger = logging.getLogger(__name__)

_config = load_config()
CHAT_SERVICE_ADDRESS = _config.chat_service.address


def _to_protobuf_messages(messages: List[Dict[str, str]]) -> List[content_pb2.Message]:
    """Convert dict messages to protobuf Message format."""
    pb_messages = []
    role_map = {
        "user": content_pb2.MessageRole.USER,
        "assistant": content_pb2.MessageRole.ASSISTANT,
        "system": content_pb2.MessageRole.SYSTEM,
        "tool": content_pb2.MessageRole.TOOL,
    }

    for msg in messages:
        role_str = msg.get("role", "user").lower()
        role = role_map.get(role_str, content_pb2.MessageRole.USER)

        # Extract content - handle both string and dict formats
        content_str = msg.get("content", "")
        if isinstance(content_str, dict):
            content_str = content_str.get("text", str(content_str))
        elif not isinstance(content_str, str):
            content_str = str(content_str)

        pb_msg = content_pb2.Message(
            role=role,
            contents=[content_pb2.Content(text=content_str)],
        )
        pb_messages.append(pb_msg)

    return pb_messages


async def websocket_chat_stream(websocket: WebSocket):
    """WebSocket endpoint for streaming multi-model chat responses via gRPC."""
    await websocket.accept()
    channel = None

    try:
        # Receive initial message with models and messages
        data = await websocket.receive_json()
        models: List[str] = data.get("models", [])
        messages: List[Dict[str, str]] = data.get("messages", [])

        if not messages:
            await websocket.send_json({
                "type": "error",
                "error": "Missing required field: messages",
            })
            await websocket.close()
            return

        # Convert messages to protobuf format
        pb_messages = _to_protobuf_messages(messages)

        # Create gRPC channel and stub
        channel = grpc.aio.insecure_channel(CHAT_SERVICE_ADDRESS)
        stub = chat_pb2_grpc.ChatStub(channel)

        # Build ChatRequest
        request = chat_pb2.ChatRequest(
            messages=pb_messages,
            models=models if models else [],
        )

        # Track which models we've seen responses from
        seen_models = set()

        # Stream responses from gRPC
        async for response in stub.Chat(request):
            model_name = response.model
            delta = response.delta

            seen_models.add(model_name)

            # Send content chunk
            if delta.content:
                await websocket.send_json({
                    "type": "content",
                    "model": model_name,
                    "content": delta.content,
                })

        # Send completion signals for all models we saw responses from
        for model_name in seen_models:
            await websocket.send_json({
                "type": "done",
                "model": model_name,
            })

    except asyncio.CancelledError:
        raise
    except grpc.RpcError as e:
        logger.warning("gRPC error in chat WebSocket: %s - %s", e.code(), e.details())
        try:
            await websocket.send_json({
                "type": "error",
                "error": "AI service temporarily unavailable. Please try again.",
            })
        except (WebSocketDisconnect, RuntimeError):
            pass
    except WebSocketDisconnect:
        pass
    except (ConnectionResetError, BrokenPipeError) as e:
        logger.debug("Connection closed: %s", e)
    except Exception as e:
        logger.exception("Unexpected error in chat WebSocket")
        try:
            await websocket.send_json({
                "type": "error",
                "error": "An unexpected error occurred. Please try again.",
            })
        except (WebSocketDisconnect, RuntimeError):
            pass
    finally:
        if channel:
            await channel.close()
