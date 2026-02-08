"""FastAPI application entry point."""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Dict, List, Optional

import grpc.aio
import httpx
from fastapi import FastAPI, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from pb.api.chat import chat_pb2, chat_pb2_grpc
from pb.api.room import room_pb2, room_pb2_grpc
from pb.shared import content_pb2

from gateway.config import load_config

logger = logging.getLogger(__name__)

# Load configuration
_config = load_config()


# ---------------------------------------------------------------------------
# Pydantic models for request/response validation
# ---------------------------------------------------------------------------


class LLMConfigRequest(BaseModel):
    """LLM configuration for room creation."""
    id: str
    model: str
    persona: str = ""
    display_name: str
    title: str = ""


class CreateRoomRequest(BaseModel):
    """Request body for creating a room."""
    name: str
    description: str = ""
    llms: List[LLMConfigRequest] = Field(default_factory=list)
    created_by: str = "anonymous"


class CreateRoomResponse(BaseModel):
    """Response from room creation."""
    room_id: str


class LLMSummary(BaseModel):
    """Summary of an LLM in a room listing."""
    id: str
    model: str
    display_name: str


class RoomSummary(BaseModel):
    """Summary of a room for listing."""
    room_id: str
    name: str
    description: str = ""
    created_at: Optional[str] = None
    created_by: str
    llms: List[LLMSummary] = Field(default_factory=list)


class ListRoomsResponse(BaseModel):
    """Response from listing rooms."""
    rooms: List[RoomSummary]
    next_cursor: Optional[str] = None


class LLMDetail(BaseModel):
    """Detailed LLM info including persona."""
    id: str
    model: str
    display_name: str
    persona: str = ""


class RoomDetail(BaseModel):
    """Detailed room info."""
    room_id: str
    name: str
    description: str = ""
    created_at: Optional[str] = None
    created_by: str
    llms: List[LLMDetail] = Field(default_factory=list)


class ParticipantInfo(BaseModel):
    """Participant info for room details."""
    id: str
    name: str
    role: int
    type: int


class GetRoomResponse(BaseModel):
    """Response from getting room details."""
    room: RoomDetail
    participants: List[ParticipantInfo] = Field(default_factory=list)


class ModelInfo(BaseModel):
    """OpenRouter model info."""
    id: str
    name: str


class ListModelsResponse(BaseModel):
    """Response from listing models."""
    models: List[ModelInfo]


class HealthResponse(BaseModel):
    """Health check response."""
    status: str


class RootResponse(BaseModel):
    """Root endpoint response."""
    service: str
    status: str
    endpoints: Dict[str, str]

app = FastAPI(title="Web Gateway", description="FastAPI gateway for microservices")

# Configure CORS (from config)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_config.cors.origins,
    allow_credentials=_config.cors.allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)

# gRPC service addresses (loaded from config with env override)
CHAT_SERVICE_ADDRESS = _config.chat_service.address
ROOM_SERVICE_ADDRESS = _config.room_service.address

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
        
    except asyncio.CancelledError:
        # Task was cancelled (e.g., during shutdown) - don't log as error
        raise
    except grpc.RpcError as e:
        # gRPC-specific errors
        try:
            await websocket.send_json({
                "type": "error",
                "error": f"gRPC error: {e.code()} - {e.details()}",
            })
        except (WebSocketDisconnect, RuntimeError):
            pass
    except WebSocketDisconnect:
        # Client disconnected, cleanup will happen automatically
        pass
    except (ConnectionResetError, BrokenPipeError) as e:
        # Network-level connection issues
        logger.debug("Connection closed: %s", e)
    except Exception as e:
        logger.exception("Unexpected error in chat WebSocket")
        try:
            await websocket.send_json({
                "type": "error",
                "error": f"Server error: {type(e).__name__}",
            })
        except (WebSocketDisconnect, RuntimeError):
            # WebSocket already closed
            pass
    finally:
        # Clean up gRPC channel
        if channel:
            await channel.close()


# ---------------------------------------------------------------------------
# Room endpoints
# ---------------------------------------------------------------------------


@app.post("/api/rooms", response_model=CreateRoomResponse)
async def create_room(body: CreateRoomRequest) -> CreateRoomResponse:
    """Create a new room with the specified configuration."""
    channel = grpc.aio.insecure_channel(ROOM_SERVICE_ADDRESS)
    stub = room_pb2_grpc.RoomStub(channel)

    llm_configs = [
        room_pb2.LLMConfig(
            id=llm.id,
            model=llm.model,
            persona=llm.persona,
            display_name=llm.display_name,
            title=llm.title,
        )
        for llm in body.llms
    ]

    try:
        resp = await stub.CreateRoom(
            room_pb2.CreateRoomRequest(
                name=body.name,
                llms=llm_configs,
                created_by=body.created_by,
                description=body.description,
            )
        )
        return CreateRoomResponse(room_id=resp.room_id)
    finally:
        await channel.close()


@app.get("/api/rooms", response_model=ListRoomsResponse)
async def list_rooms(
    user_id: Optional[str] = None,
    limit: int = 20,
    cursor: Optional[str] = None,
) -> ListRoomsResponse:
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
        rooms = [
            RoomSummary(
                room_id=r.room_id,
                name=r.name,
                created_at=r.created_at.ToJsonString() if r.created_at.ByteSize() else None,
                created_by=r.created_by,
                description=r.description,
                llms=[
                    LLMSummary(id=l.id, model=l.model, display_name=l.display_name)
                    for l in r.llms
                ],
            )
            for r in resp.rooms
        ]
        return ListRoomsResponse(
            rooms=rooms,
            next_cursor=resp.next_cursor if resp.HasField("next_cursor") else None,
        )
    finally:
        await channel.close()


@app.get("/api/rooms/{room_id}", response_model=GetRoomResponse)
async def get_room(room_id: str) -> GetRoomResponse:
    """Get room details + online participants."""
    from fastapi import HTTPException

    channel = grpc.aio.insecure_channel(ROOM_SERVICE_ADDRESS)
    stub = room_pb2_grpc.RoomStub(channel)

    try:
        resp = await stub.GetRoom(room_pb2.GetRoomRequest(room_id=room_id))
        room = resp.room
        return GetRoomResponse(
            room=RoomDetail(
                room_id=room.room_id,
                name=room.name,
                created_at=room.created_at.ToJsonString() if room.created_at.ByteSize() else None,
                created_by=room.created_by,
                description=room.description,
                llms=[
                    LLMDetail(id=l.id, model=l.model, display_name=l.display_name, persona=l.persona)
                    for l in room.llms
                ],
            ),
            participants=[
                ParticipantInfo(id=p.id, name=p.name, role=p.role, type=p.type)
                for p in resp.participants
            ],
        )
    except grpc.RpcError as e:
        if e.code() == grpc.StatusCode.NOT_FOUND:
            raise HTTPException(status_code=404, detail=e.details())
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
                                    title=data.get("title", ""),
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
                    elif msg_type == "add_llm":
                        llm_data = data.get("llm", {})
                        await request_queue.put(
                            room_pb2.ClientMessage(
                                add_llm=room_pb2.AddLLM(
                                    llm=room_pb2.LLMConfig(
                                        id=llm_data.get("id", ""),
                                        model=llm_data.get("model", ""),
                                        persona=llm_data.get("persona", ""),
                                        display_name=llm_data.get("display_name", ""),
                                        title=llm_data.get("title", ""),
                                    )
                                )
                            )
                        )
                    elif msg_type == "update_llm":
                        update = room_pb2.UpdateLLM(
                            llm_id=data.get("llm_id", ""),
                        )
                        if "model" in data:
                            update.model = data["model"]
                        if "persona" in data:
                            update.persona = data["persona"]
                        if "display_name" in data:
                            update.display_name = data["display_name"]
                        if "title" in data:
                            update.title = data["title"]
                        await request_queue.put(
                            room_pb2.ClientMessage(update_llm=update)
                        )
                    elif msg_type == "create_poll":
                        options = [
                            room_pb2.PollOptionInput(
                                text=opt.get("text", ""),
                                description=opt.get("description", ""),
                            )
                            for opt in data.get("options", [])
                        ]
                        await request_queue.put(
                            room_pb2.ClientMessage(
                                create_poll=room_pb2.CreatePoll(
                                    question=data.get("question", ""),
                                    options=options,
                                    allow_multiple=data.get("allow_multiple", False),
                                    anonymous=data.get("anonymous", False),
                                    mandatory=data.get("mandatory", False),
                                )
                            )
                        )
                    elif msg_type == "cast_vote":
                        await request_queue.put(
                            room_pb2.ClientMessage(
                                cast_vote=room_pb2.CastVote(
                                    poll_id=data.get("poll_id", ""),
                                    option_ids=data.get("option_ids", []),
                                    reason=data.get("reason", ""),
                                )
                            )
                        )
                    elif msg_type == "close_poll":
                        await request_queue.put(
                            room_pb2.ClientMessage(
                                close_poll=room_pb2.ClosePoll(
                                    poll_id=data.get("poll_id", ""),
                                )
                            )
                        )
                    elif msg_type == "ping":
                        await request_queue.put(
                            room_pb2.ClientMessage(ping=room_pb2.Ping())
                        )
            except WebSocketDisconnect:
                await request_queue.put(None)  # Signal end of stream
            except asyncio.CancelledError:
                await request_queue.put(None)
                raise
            except (ConnectionResetError, BrokenPipeError):
                await request_queue.put(None)
            except Exception as e:
                logger.warning("Error reading from WebSocket: %s", e)
                await request_queue.put(None)

        async def _read_grpc():
            """Read from gRPC stream, translate ServerEvents to WebSocket JSON."""
            try:
                async for event in response_stream:
                    ws_msg = _server_event_to_json(event)
                    if ws_msg:
                        await websocket.send_json(ws_msg)
            except asyncio.CancelledError:
                raise
            except grpc.RpcError as e:
                logger.warning("gRPC error in room session: %s - %s", e.code(), e.details())
                try:
                    await websocket.send_json({
                        "type": "error",
                        "error": f"Room service error: {e.details()}",
                    })
                except (WebSocketDisconnect, RuntimeError):
                    pass
            except (ConnectionResetError, BrokenPipeError):
                pass
            except Exception as e:
                logger.warning("Error reading from gRPC stream: %s", e)

        # Run both loops concurrently; when either finishes, we're done
        ws_task = asyncio.create_task(_read_ws())
        grpc_task = asyncio.create_task(_read_grpc())

        done, pending = await asyncio.wait(
            [ws_task, grpc_task], return_when=asyncio.FIRST_COMPLETED
        )
        for task in pending:
            task.cancel()

    except asyncio.CancelledError:
        raise
    except (ConnectionResetError, BrokenPipeError):
        pass
    except Exception as e:
        logger.exception("Unexpected error in room WebSocket")
        try:
            await websocket.send_json({
                "type": "error",
                "error": f"Gateway error: {type(e).__name__}",
            })
        except (WebSocketDisconnect, RuntimeError):
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
                "description": room.description,
            },
            "participants": [
                {"id": p.id, "name": p.name, "role": p.role, "type": p.type, "title": p.title}
                for p in rs.participants
            ],
            "messages": [_message_to_json(m) for m in rs.messages],
            "llms": [
                {"id": l.id, "model": l.model, "display_name": l.display_name, "persona": l.persona, "title": l.title}
                for l in room.llms
            ],
            "polls": [_poll_to_json(p) for p in rs.polls],
        }

    elif payload == "message_received":
        return _message_to_json(event.message_received.message)

    elif payload == "user_joined":
        u = event.user_joined.user
        return {
            "type": "user_joined",
            "user": {"id": u.id, "name": u.name, "role": u.role, "type": u.type, "title": u.title},
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

    elif payload == "llm_added":
        l = event.llm_added.llm
        return {
            "type": "llm_added",
            "llm": {
                "id": l.id, "model": l.model, "display_name": l.display_name,
                "persona": l.persona, "title": l.title,
            },
        }

    elif payload == "llm_updated":
        l = event.llm_updated.llm
        return {
            "type": "llm_updated",
            "llm": {
                "id": l.id, "model": l.model, "display_name": l.display_name,
                "persona": l.persona, "title": l.title,
            },
        }

    elif payload == "poll_created":
        return {
            "type": "poll_created",
            "poll": _poll_to_json(event.poll_created.poll),
        }

    elif payload == "poll_voted":
        pv = event.poll_voted
        return {
            "type": "poll_voted",
            "poll_id": pv.poll_id,
            "option_id": pv.option_id,
            "vote": {
                "voter_id": pv.vote.voter_id,
                "voter_name": pv.vote.voter_name,
                "reason": pv.vote.reason,
                "voted_at": pv.vote.voted_at.ToMilliseconds() if pv.vote.voted_at.ByteSize() else 0,
            },
        }

    elif payload == "poll_closed":
        pc = event.poll_closed
        return {
            "type": "poll_closed",
            "poll_id": pc.poll_id,
            "closed_by_id": pc.closed_by_id,
            "closed_by_name": pc.closed_by_name,
        }

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
    if m.HasField("poll_id"):
        result["poll_id"] = m.poll_id
    return result


def _poll_to_json(p: room_pb2.Poll) -> dict:
    """Convert a Poll proto to JSON-serializable dict."""
    return {
        "poll_id": p.poll_id,
        "room_id": p.room_id,
        "creator_id": p.creator_id,
        "creator_name": p.creator_name,
        "creator_type": "llm" if p.creator_type == room_pb2.LLM else "human",
        "question": p.question,
        "options": [
            {
                "id": opt.id,
                "text": opt.text,
                "description": opt.description,
                "votes": [
                    {
                        "voter_id": v.voter_id,
                        "voter_name": v.voter_name,
                        "reason": v.reason,
                        "voted_at": v.voted_at.ToMilliseconds() if v.voted_at.ByteSize() else 0,
                    }
                    for v in opt.votes
                ],
            }
            for opt in p.options
        ],
        "allow_multiple": p.allow_multiple,
        "anonymous": p.anonymous,
        "mandatory": p.mandatory,
        "status": "open" if p.status == room_pb2.POLL_OPEN else "closed",
        "created_at": p.created_at.ToMilliseconds() if p.created_at.ByteSize() else 0,
        "closed_at": p.closed_at.ToMilliseconds() if p.closed_at.ByteSize() else 0,
    }


# ---------------------------------------------------------------------------
# Model catalog (proxied from OpenRouter with cache)
# ---------------------------------------------------------------------------

_models_cache: dict = {"data": None, "ts": 0}
_MODELS_CACHE_TTL = 600  # 10 minutes


@app.get("/api/models", response_model=ListModelsResponse)
async def list_models(q: str = Query(default="")) -> ListModelsResponse:
    """Search OpenRouter model catalog. Cached for 10 minutes."""
    now = time.time()
    if _models_cache["data"] is None or now - _models_cache["ts"] > _MODELS_CACHE_TTL:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get("https://openrouter.ai/api/v1/models")
                resp.raise_for_status()
                _models_cache["data"] = resp.json().get("data", [])
                _models_cache["ts"] = now
        except httpx.HTTPStatusError as e:
            logger.error("OpenRouter API error: %s %s", e.response.status_code, e.response.text[:200])
            if _models_cache["data"] is None:
                return ListModelsResponse(models=[])
        except httpx.RequestError as e:
            logger.error("Failed to fetch OpenRouter models: %s", e)
            if _models_cache["data"] is None:
                return ListModelsResponse(models=[])

    models = _models_cache["data"]
    if q:
        q_lower = q.lower()
        models = [m for m in models if q_lower in m.get("id", "").lower() or q_lower in m.get("name", "").lower()]

    # Return a slim response (top 50)
    return ListModelsResponse(
        models=[
            ModelInfo(id=m.get("id", ""), name=m.get("name", ""))
            for m in models[:50]
        ]
    )


@app.get("/", response_model=RootResponse)
async def root() -> RootResponse:
    """Root endpoint with service info and available endpoints."""
    return RootResponse(
        service="web-gateway",
        status="running",
        endpoints={
            "health": "/health",
            "chat_ws": "/ws/chat/stream",
            "room_ws": "/ws/room/{room_id}",
            "rooms_api": "/api/rooms",
            "models_api": "/api/models",
        },
    )


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    """Health check endpoint."""
    return HealthResponse(status="ok")
