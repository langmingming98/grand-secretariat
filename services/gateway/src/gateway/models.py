"""Pydantic models for request/response validation."""

from typing import Dict, List, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Room models
# ---------------------------------------------------------------------------


class LLMConfigRequest(BaseModel):
    """LLM configuration for room creation."""

    id: str = Field(..., max_length=50)
    model: str = Field(..., max_length=100)
    persona: str = Field(default="", max_length=2000)
    display_name: str = Field(..., max_length=100)
    title: str = Field(default="", max_length=100)


class CreateRoomRequest(BaseModel):
    """Request body for creating a room."""

    name: str = Field(..., min_length=1, max_length=200)
    description: str = Field(default="", max_length=2000)
    llms: List[LLMConfigRequest] = Field(default_factory=list, max_length=10)
    created_by: str = Field(default="anonymous", max_length=100)
    visibility: str = Field(default="public", pattern="^(public|private)$")


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
    visibility: str = "public"  # "public" or "private"
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
    title: str = ""
    chat_style: int = 0
    avatar: str = ""


class RoomDetail(BaseModel):
    """Detailed room info."""

    room_id: str
    name: str
    description: str = ""
    created_at: Optional[str] = None
    created_by: str
    visibility: str = "public"  # "public" or "private"
    llms: List[LLMDetail] = Field(default_factory=list)


class ParticipantInfo(BaseModel):
    """Participant info for room details."""

    id: str
    name: str
    role: str  # "admin" | "member" | "viewer"
    type: str  # "human" | "llm"
    title: str = ""
    is_online: bool = True
    avatar: str = ""


class GetRoomResponse(BaseModel):
    """Response from getting room details."""

    room: RoomDetail
    participants: List[ParticipantInfo] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Model catalog models
# ---------------------------------------------------------------------------


class ModelInfo(BaseModel):
    """OpenRouter model info."""

    id: str
    name: str


class ListModelsResponse(BaseModel):
    """Response from listing models."""

    models: List[ModelInfo]


# ---------------------------------------------------------------------------
# History loading models
# ---------------------------------------------------------------------------


class MessageSender(BaseModel):
    """Message sender info."""

    id: str
    name: str
    type: str  # "human" | "llm"


class HistoryMessage(BaseModel):
    """Message in history response."""

    id: str
    sender: MessageSender
    content: str
    reply_to: Optional[str] = None
    timestamp: int
    poll_id: Optional[str] = None


class LoadHistoryResponse(BaseModel):
    """Response from loading message history."""

    messages: List[HistoryMessage]
    next_cursor: Optional[str] = None


# ---------------------------------------------------------------------------
# Room config generation models
# ---------------------------------------------------------------------------


class GenerateConfigRequest(BaseModel):
    """Request for AI-generated room configuration."""

    prompt: str = Field(..., min_length=1, max_length=1000)


class GeneratedLLMConfig(BaseModel):
    """AI-generated LLM configuration."""

    id: str
    model: str
    display_name: str
    persona: str
    title: str = ""


class GenerateConfigResponse(BaseModel):
    """AI-generated room configuration."""

    name: str
    description: str
    topic: str = ""
    goal: str = ""
    llms: List[GeneratedLLMConfig] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Health/Root models
# ---------------------------------------------------------------------------


class HealthResponse(BaseModel):
    """Health check response."""

    status: str


class RootResponse(BaseModel):
    """Root endpoint response."""

    service: str
    status: str
    endpoints: Dict[str, str]
