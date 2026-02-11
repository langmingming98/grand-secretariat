"""Room REST API endpoints."""

import json
import logging
from typing import Optional

import grpc.aio
from fastapi import APIRouter, HTTPException, Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from pb.api.room import room_pb2, room_pb2_grpc
from pb.api.chat import chat_pb2, chat_pb2_grpc
from pb.shared import content_pb2

from gateway.config import load_config
from gateway.converters import participant_type_to_str, role_to_str, visibility_to_str, visibility_from_str
from gateway.models import (
    CreateRoomRequest,
    CreateRoomResponse,
    GenerateConfigRequest,
    GenerateConfigResponse,
    GeneratedLLMConfig,
    GetRoomResponse,
    HistoryMessage,
    ListRoomsResponse,
    LoadHistoryResponse,
    LLMDetail,
    LLMSummary,
    MessageSender,
    ParticipantInfo,
    RoomDetail,
    RoomSummary,
)

logger = logging.getLogger(__name__)

# Rate limiter for room endpoints
limiter = Limiter(key_func=get_remote_address)

router = APIRouter(prefix="/api/rooms", tags=["rooms"])

_config = load_config()
ROOM_SERVICE_ADDRESS = _config.room_service.address
CHAT_SERVICE_ADDRESS = _config.chat_service.address

# Fast models for room config generation
GENERATOR_MODEL = "z-ai/glm-4.7-flash"

# Available models for AI to assign (fast, capable models)
AVAILABLE_MODELS = [
    {"id": "anthropic/claude-3.5-haiku", "name": "Claude 3.5 Haiku", "strengths": "fast, balanced, good at following instructions"},
    {"id": "openai/gpt-4o-mini", "name": "GPT-4o Mini", "strengths": "fast, creative, broad knowledge"},
    {"id": "google/gemini-2.5-flash-lite-preview-09-2025", "name": "Gemini 2.5 Flash Lite", "strengths": "very fast, analytical, good at structured tasks"},
]

ROOM_CONFIG_SYSTEM_PROMPT = """You are a room configuration assistant. Given a user's description of the room they want to create, generate a structured JSON configuration.

Available models to assign (pick appropriate ones based on roles):
{models}

Guidelines:
- Create 2-4 LLMs based on the prompt (unless user specifies otherwise)
- Each LLM should have a distinct perspective/role that creates interesting dynamics
- Personas should be detailed (2-3 sentences) with specific personality traits
- Use different models for variety when appropriate
- Make the room engaging and productive for the stated goal
- Room name should be short (2-5 words)
- Description should be 1-2 sentences about the room's purpose"""

# JSON schema for structured output from the LLM
ROOM_CONFIG_JSON_SCHEMA = {
    "name": "room_config",
    "strict": True,
    "schema": {
        "type": "object",
        "properties": {
            "name": {"type": "string", "description": "Short room name (2-5 words)"},
            "description": {"type": "string", "description": "1-2 sentence description of the room's purpose"},
            "topic": {"type": "string", "description": "Main topic or theme"},
            "goal": {"type": "string", "description": "What participants should achieve"},
            "llms": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "id": {"type": "string", "description": "Short identifier, no spaces"},
                        "model": {"type": "string", "description": "Model ID from available list"},
                        "display_name": {"type": "string", "description": "Character name"},
                        "persona": {"type": "string", "description": "Detailed persona with personality, expertise, speaking style"},
                        "title": {"type": "string", "description": "Job title or role"},
                    },
                    "required": ["id", "model", "display_name", "persona", "title"],
                    "additionalProperties": False,
                },
            },
        },
        "required": ["name", "description", "topic", "goal", "llms"],
        "additionalProperties": False,
    },
}


@router.post("", response_model=CreateRoomResponse)
@limiter.limit("10/minute")
async def create_room(request: Request, body: CreateRoomRequest) -> CreateRoomResponse:
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
                visibility=visibility_from_str(body.visibility),
            )
        )
        return CreateRoomResponse(room_id=resp.room_id)
    finally:
        await channel.close()


@router.get("", response_model=ListRoomsResponse)
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
                visibility=visibility_to_str(r.visibility),
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


@router.get("/{room_id}", response_model=GetRoomResponse)
async def get_room(room_id: str) -> GetRoomResponse:
    """Get room details + online participants."""
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
                visibility=visibility_to_str(room.visibility),
                llms=[
                    LLMDetail(id=l.id, model=l.model, display_name=l.display_name, persona=l.persona)
                    for l in room.llms
                ],
            ),
            participants=[
                ParticipantInfo(
                    id=p.id,
                    name=p.name,
                    role=role_to_str(p.role),
                    type=participant_type_to_str(p.type),
                    title=p.title,
                    is_online=p.is_online,
                )
                for p in resp.participants
            ],
        )
    except grpc.RpcError as e:
        if e.code() == grpc.StatusCode.NOT_FOUND:
            raise HTTPException(status_code=404, detail="Room not found")
        logger.error("Room service error: %s - %s", e.code(), e.details())
        raise HTTPException(status_code=503, detail="Room service unavailable")
    finally:
        await channel.close()


@router.get("/{room_id}/history", response_model=LoadHistoryResponse)
async def load_history(
    room_id: str,
    limit: int = 50,
    cursor: Optional[str] = None,
) -> LoadHistoryResponse:
    """Load message history for a room (for scroll-up pagination)."""
    channel = grpc.aio.insecure_channel(ROOM_SERVICE_ADDRESS)
    stub = room_pb2_grpc.RoomStub(channel)

    try:
        resp = await stub.LoadHistory(
            room_pb2.LoadHistoryRequest(
                room_id=room_id,
                limit=limit,
                cursor=cursor,
            )
        )
        messages = [
            HistoryMessage(
                id=m.message_id,
                sender=MessageSender(
                    id=m.sender_id,
                    name=m.sender_name,
                    type=participant_type_to_str(m.sender_type),
                ),
                content=m.content,
                reply_to=m.reply_to if m.HasField("reply_to") else None,
                timestamp=m.timestamp.ToMilliseconds() if m.timestamp.ByteSize() else 0,
                poll_id=m.poll_id if m.HasField("poll_id") else None,
            )
            for m in resp.messages
        ]
        return LoadHistoryResponse(
            messages=messages,
            next_cursor=resp.next_cursor if resp.HasField("next_cursor") else None,
        )
    except grpc.RpcError as e:
        if e.code() == grpc.StatusCode.NOT_FOUND:
            raise HTTPException(status_code=404, detail="Room not found")
        logger.error("Room service error: %s - %s", e.code(), e.details())
        raise HTTPException(status_code=503, detail="Room service unavailable")
    finally:
        await channel.close()


@router.post("/generate-config", response_model=GenerateConfigResponse)
@limiter.limit("5/minute")
async def generate_room_config(request: Request, body: GenerateConfigRequest) -> GenerateConfigResponse:
    """Generate room configuration using AI based on a text prompt."""
    if not body.prompt.strip():
        raise HTTPException(status_code=400, detail="Prompt cannot be empty")

    # Build the system prompt with available models
    models_desc = "\n".join(
        f"- {m['id']}: {m['name']} ({m['strengths']})"
        for m in AVAILABLE_MODELS
    )
    system_prompt = ROOM_CONFIG_SYSTEM_PROMPT.format(models=models_desc)

    # Build chat request with structured output
    messages = [
        content_pb2.Message(
            role=content_pb2.SYSTEM,
            contents=[content_pb2.Content(text=system_prompt)],
        ),
        content_pb2.Message(
            role=content_pb2.USER,
            contents=[content_pb2.Content(text=body.prompt)],
        ),
    ]

    response_format = chat_pb2.ResponseFormat(
        type="json_schema",
        json_schema=json.dumps(ROOM_CONFIG_JSON_SCHEMA),
    )

    channel = grpc.aio.insecure_channel(CHAT_SERVICE_ADDRESS)
    try:
        stub = chat_pb2_grpc.ChatStub(channel)
        request = chat_pb2.ChatRequest(
            messages=messages,
            models=[GENERATOR_MODEL],
            max_tokens=2000,
            response_format=response_format,
        )

        # Collect streaming response
        full_response = ""
        async for response in stub.Chat(request):
            if response.delta and response.delta.content:
                full_response += response.delta.content

        # Structured output guarantees valid JSON
        try:
            config = json.loads(full_response)
        except json.JSONDecodeError as e:
            logger.error("Failed to parse AI response as JSON: %s\nResponse: %s", e, full_response)
            raise HTTPException(
                status_code=500,
                detail="AI generated invalid configuration. Please try again.",
            )

        # Validate and build response
        llms = []
        for llm_data in config.get("llms", []):
            llms.append(GeneratedLLMConfig(
                id=llm_data.get("id", ""),
                model=llm_data.get("model", AVAILABLE_MODELS[0]["id"]),
                display_name=llm_data.get("display_name", ""),
                persona=llm_data.get("persona", ""),
                title=llm_data.get("title", ""),
            ))

        return GenerateConfigResponse(
            name=config.get("name", "New Room"),
            description=config.get("description", ""),
            topic=config.get("topic", ""),
            goal=config.get("goal", ""),
            llms=llms,
        )

    except grpc.RpcError as e:
        logger.error("Chat service error: %s - %s", e.code(), e.details())
        raise HTTPException(
            status_code=503,
            detail="AI service unavailable. Please try again.",
        )
    finally:
        await channel.close()
