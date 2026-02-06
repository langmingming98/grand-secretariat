"""FastAPI application entry point."""
from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Dict, List

import grpc.aio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from pb.api.chat import chat_pb2, chat_pb2_grpc
from pb.api.room import room_pb2, room_pb2_grpc
from pb.shared import content_pb2

logger = logging.getLogger(__name__)

app = FastAPI(title="Web Gateway", description="FastAPI gateway for microservices")

# Configure CORS for Next.js dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Next.js default port
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# gRPC service addresses
grpc_host = os.environ.get("GRPC_HOST", "localhost")
grpc_port = os.environ.get("GRPC_PORT", "50051")
CHAT_SERVICE_ADDRESS = os.getenv("CHAT_SERVICE_ADDRESS", f"{grpc_host}:{grpc_port}")
ROOM_SERVICE_ADDRESS = os.getenv("ROOM_SERVICE_ADDRESS", "localhost:50052")

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


# ---------------------------------------------------------------------------
# Room endpoints
# ---------------------------------------------------------------------------


@app.post("/api/rooms")
async def create_room(body: dict):
    """Create a new room. Body: {name, llms: [{id, model, persona, display_name}], created_by}"""
    channel = grpc.aio.insecure_channel(ROOM_SERVICE_ADDRESS)
    stub = room_pb2_grpc.RoomStub(channel)

    llm_configs = [
        room_pb2.LLMConfig(
            id=llm.get("id", ""),
            model=llm.get("model", ""),
            persona=llm.get("persona", ""),
            display_name=llm.get("display_name", ""),
        )
        for llm in body.get("llms", [])
    ]

    try:
        resp = await stub.CreateRoom(
            room_pb2.CreateRoomRequest(
                name=body.get("name", "Untitled"),
                llms=llm_configs,
                created_by=body.get("created_by", "anonymous"),
            )
        )
        return {"room_id": resp.room_id}
    finally:
        await channel.close()


@app.get("/api/rooms")
async def list_rooms(user_id: str | None = None, limit: int = 20, cursor: str | None = None):
    """List rooms, optionally filtered by user."""
    channel = grpc.aio.insecure_channel(ROOM_SERVICE_ADDRESS)
    stub = room_pb2_grpc.RoomStub(channel)

    try:
        resp = await stub.ListRooms(
            room_pb2.ListRoomsRequest(
                user_id=user_id,
                limit=limit,
                cursor=cursor,
            )
        )
        rooms = []
        for r in resp.rooms:
            rooms.append({
                "room_id": r.room_id,
                "name": r.name,
                "created_at": r.created_at.ToJsonString() if r.created_at.ByteSize() else None,
                "created_by": r.created_by,
                "llms": [
                    {"id": l.id, "model": l.model, "display_name": l.display_name}
                    for l in r.llms
                ],
            })
        result = {"rooms": rooms}
        if resp.HasField("next_cursor"):
            result["next_cursor"] = resp.next_cursor
        return result
    finally:
        await channel.close()


@app.get("/api/rooms/{room_id}")
async def get_room(room_id: str):
    """Get room details + online participants."""
    channel = grpc.aio.insecure_channel(ROOM_SERVICE_ADDRESS)
    stub = room_pb2_grpc.RoomStub(channel)

    try:
        resp = await stub.GetRoom(room_pb2.GetRoomRequest(room_id=room_id))
        room = resp.room
        return {
            "room": {
                "room_id": room.room_id,
                "name": room.name,
                "created_at": room.created_at.ToJsonString() if room.created_at.ByteSize() else None,
                "created_by": room.created_by,
                "llms": [
                    {"id": l.id, "model": l.model, "display_name": l.display_name, "persona": l.persona}
                    for l in room.llms
                ],
            },
            "participants": [
                {"id": p.id, "name": p.name, "role": p.role, "type": p.type}
                for p in resp.participants
            ],
        }
    except grpc.RpcError as e:
        if e.code() == grpc.StatusCode.NOT_FOUND:
            from fastapi.responses import JSONResponse
            return JSONResponse(status_code=404, content={"error": e.details()})
        raise
    finally:
        await channel.close()


@app.websocket("/ws/room/{room_id}")
async def websocket_room_session(websocket: WebSocket, room_id: str):
    """WebSocket ↔ gRPC bidi stream for room sessions.

    The client must send a join message first:
      {"type": "join", "user_id": "...", "name": "...", "role": "member"}

    Then send messages:
      {"type": "message", "content": "Hello @claude", "mentions": ["claude"]}
      {"type": "typing", "is_typing": true}
      {"type": "interrupt", "llm_id": "claude"}
      {"type": "ping"}

    Server pushes events as JSON with a "type" field.
    """
    await websocket.accept()
    channel = grpc.aio.insecure_channel(ROOM_SERVICE_ADDRESS)

    try:
        stub = room_pb2_grpc.RoomStub(channel)

        # Set up the bidi stream - we need to provide an async iterator for requests
        request_queue: asyncio.Queue[room_pb2.ClientMessage | None] = asyncio.Queue()

        async def request_iterator():
            while True:
                msg = await request_queue.get()
                if msg is None:
                    return
                yield msg

        # Start the bidi stream
        response_stream = stub.RoomSession(request_iterator())

        async def _read_ws():
            """Read from WebSocket, translate to gRPC ClientMessages."""
            try:
                while True:
                    data = await websocket.receive_json()
                    msg_type = data.get("type")

                    if msg_type == "join":
                        role_map = {
                            "admin": room_pb2.ADMIN,
                            "member": room_pb2.MEMBER,
                            "viewer": room_pb2.VIEWER,
                        }
                        await request_queue.put(
                            room_pb2.ClientMessage(
                                join=room_pb2.JoinRoom(
                                    room_id=room_id,
                                    user_id=data.get("user_id", ""),
                                    display_name=data.get("name", "Anonymous"),
                                    role=role_map.get(
                                        data.get("role", "member"), room_pb2.MEMBER
                                    ),
                                )
                            )
                        )
                    elif msg_type == "message":
                        cm = room_pb2.ClientMessage(
                            message=room_pb2.SendMessage(
                                content=data.get("content", ""),
                                mentions=data.get("mentions", []),
                            )
                        )
                        if data.get("reply_to"):
                            cm.message.reply_to = data["reply_to"]
                        await request_queue.put(cm)
                    elif msg_type == "typing":
                        await request_queue.put(
                            room_pb2.ClientMessage(
                                typing=room_pb2.TypingIndicator(
                                    is_typing=data.get("is_typing", False)
                                )
                            )
                        )
                    elif msg_type == "interrupt":
                        interrupt = room_pb2.InterruptLLM(
                            llm_id=data.get("llm_id", "")
                        )
                        if data.get("message_id"):
                            interrupt.message_id = data["message_id"]
                        await request_queue.put(
                            room_pb2.ClientMessage(interrupt=interrupt)
                        )
                    elif msg_type == "ping":
                        await request_queue.put(
                            room_pb2.ClientMessage(ping=room_pb2.Ping())
                        )
            except WebSocketDisconnect:
                await request_queue.put(None)  # Signal end of stream
            except Exception:
                await request_queue.put(None)

        async def _read_grpc():
            """Read from gRPC stream, translate ServerEvents to WebSocket JSON."""
            try:
                async for event in response_stream:
                    ws_msg = _server_event_to_json(event)
                    if ws_msg:
                        await websocket.send_json(ws_msg)
            except grpc.RpcError as e:
                try:
                    await websocket.send_json({
                        "type": "error",
                        "error": f"Room service error: {e.details()}",
                    })
                except Exception:
                    pass
            except Exception:
                pass

        # Run both loops concurrently; when either finishes, we're done
        ws_task = asyncio.create_task(_read_ws())
        grpc_task = asyncio.create_task(_read_grpc())

        done, pending = await asyncio.wait(
            [ws_task, grpc_task], return_when=asyncio.FIRST_COMPLETED
        )
        for task in pending:
            task.cancel()

    except Exception as e:
        try:
            await websocket.send_json({
                "type": "error",
                "error": f"Gateway error: {str(e)}",
            })
        except Exception:
            pass
    finally:
        await channel.close()


def _server_event_to_json(event: room_pb2.ServerEvent) -> dict | None:
    """Translate a gRPC ServerEvent to a WebSocket JSON message."""
    payload = event.WhichOneof("payload")

    if payload == "room_state":
        rs = event.room_state
        room = rs.room
        return {
            "type": "room_state",
            "room": {
                "id": room.room_id,
                "name": room.name,
                "created_at": room.created_at.ToJsonString() if room.created_at.ByteSize() else None,
            },
            "participants": [
                {"id": p.id, "name": p.name, "role": p.role, "type": p.type}
                for p in rs.participants
            ],
            "messages": [_message_to_json(m) for m in rs.messages],
            "llms": [
                {"id": l.id, "model": l.model, "display_name": l.display_name}
                for l in room.llms
            ],
        }

    elif payload == "message_received":
        return _message_to_json(event.message_received.message)

    elif payload == "user_joined":
        u = event.user_joined.user
        return {
            "type": "user_joined",
            "user": {"id": u.id, "name": u.name, "role": u.role, "type": u.type},
        }

    elif payload == "user_left":
        return {"type": "user_left", "user_id": event.user_left.user_id}

    elif payload == "llm_thinking":
        t = event.llm_thinking
        return {"type": "llm_thinking", "llm_id": t.llm_id, "reply_to": t.reply_to}

    elif payload == "llm_chunk":
        c = event.llm_chunk
        return {
            "type": "llm_chunk",
            "message_id": c.message_id,
            "llm_id": c.llm_id,
            "content": c.content,
            "reply_to": c.reply_to,
        }

    elif payload == "llm_done":
        d = event.llm_done
        return {"type": "llm_done", "message_id": d.message_id, "llm_id": d.llm_id}

    elif payload == "user_typing":
        t = event.user_typing
        return {
            "type": "typing",
            "user": {"id": t.user_id, "name": t.user_name},
            "is_typing": t.is_typing,
        }

    elif payload == "error":
        return {"type": "error", "error": event.error.message, "code": event.error.code}

    elif payload == "pong":
        return {"type": "pong"}

    return None


def _message_to_json(m: room_pb2.Message) -> dict:
    result = {
        "type": "message",
        "id": m.message_id,
        "sender": {
            "id": m.sender_id,
            "name": m.sender_name,
            "type": "llm" if m.sender_type == room_pb2.LLM else "human",
        },
        "content": m.content,
        "timestamp": m.timestamp.ToMilliseconds() if m.timestamp.ByteSize() else 0,
    }
    if m.HasField("reply_to"):
        result["reply_to"] = m.reply_to
    return result


@app.get("/")
async def root():
    return {
        "service": "web-gateway",
        "status": "running",
        "endpoints": {
            "health": "/health",
            "chat_ws": "/ws/chat/stream",
            "room_ws": "/ws/room/{room_id}",
            "rooms_api": "/api/rooms",
        }
    }


@app.get("/health")
async def health():
    return {"status": "ok"}
