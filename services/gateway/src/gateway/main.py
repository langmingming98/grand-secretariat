"""FastAPI application entry point."""
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import grpc.aio
import os
from typing import List, Dict

from pb.api.chat import chat_pb2, chat_pb2_grpc
from pb.shared import content_pb2

app = FastAPI(title="Web Gateway", description="FastAPI gateway for microservices")

# Configure CORS for Next.js dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Next.js default port
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# gRPC chat service address (default to localhost:50051)
grpc_host = os.environ.get("GRPC_HOST", "localhost")
grpc_port = os.environ.get("GRPC_PORT", "50051")
CHAT_SERVICE_ADDRESS = os.getenv("CHAT_SERVICE_ADDRESS", f"{grpc_host}:{grpc_port}")

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
            # If content is a dict, try to extract text
            content_str = content_str.get("text", str(content_str))
        elif not isinstance(content_str, str):
            content_str = str(content_str)

        pb_msg = content_pb2.Message(
            role=role,
            contents=[content_pb2.Content(text=content_str)],
        )
        pb_messages.append(pb_msg)

    return pb_messages


@app.websocket("/ws/chat/stream")
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
            models=models if models else [],  # Empty list = use server defaults
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
        # (The gRPC stream ends when all models complete)
        for model_name in seen_models:
            await websocket.send_json({
                "type": "done",
                "model": model_name,
            })
        
    except grpc.RpcError as e:
        # gRPC-specific errors
        await websocket.send_json({
            "type": "error",
            "error": f"gRPC error: {e.code()} - {e.details()}",
        })
    except WebSocketDisconnect:
        # Client disconnected, cleanup will happen automatically
        pass
    except Exception as e:
        try:
            await websocket.send_json({
                "type": "error",
                "error": f"Server error: {str(e)}",
            })
        except Exception:
            # WebSocket already closed, ignore
            pass
    finally:
        # Clean up gRPC channel
        if channel:
            await channel.close()


@app.get("/")
async def root():
    return {
        "service": "web-gateway",
        "status": "running",
        "endpoints": {
            "health": "/health",
            "websocket": "/ws/chat/stream"
        }
    }


@app.get("/health")
async def health():
    return {"status": "ok"}
