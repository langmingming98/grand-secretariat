"""FastAPI application entry point.

This module sets up the FastAPI application with:
- CORS middleware
- REST routers (rooms, models)
- WebSocket endpoints (room sessions, chat)
- Health and root endpoints

All business logic is delegated to routers/ and websockets/ submodules.
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from gateway.config import load_config
from gateway.models import HealthResponse, RootResponse
from gateway.routers import rooms_router, models_router
from gateway.websockets import websocket_room_session, websocket_chat_stream

# Load configuration
_config = load_config()

# Create FastAPI app
app = FastAPI(title="Web Gateway", description="FastAPI gateway for microservices")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=_config.cors.origins,
    allow_credentials=_config.cors.allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include REST routers
app.include_router(rooms_router)
app.include_router(models_router)

# Register WebSocket endpoints
app.websocket("/ws/room/{room_id}")(websocket_room_session)
app.websocket("/ws/chat/stream")(websocket_chat_stream)


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
