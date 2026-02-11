"""FastAPI application entry point.

This module sets up the FastAPI application with:
- CORS middleware
- Rate limiting (slowapi)
- REST routers (rooms, models)
- WebSocket endpoints (room sessions, chat)
- Health and root endpoints

All business logic is delegated to routers/ and websockets/ submodules.
"""

from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from common.logging import setup_cloudwatch_logging

logger = logging.getLogger(__name__)
from gateway.config import load_config
from gateway.models import HealthResponse, RootResponse
from gateway.routers import rooms_router, models_router
from gateway.websockets import websocket_room_session, websocket_chat_stream

# Configure logging (must be before other imports that use logging)
setup_cloudwatch_logging("gateway")

# Load configuration
_config = load_config()

# Set up rate limiter (by IP address)
limiter = Limiter(key_func=get_remote_address)

# Create FastAPI app
app = FastAPI(title="Web Gateway", description="FastAPI gateway for microservices")

# Add rate limiter to app state
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Catch-all exception handler to prevent stack traces from leaking."""
    logger.exception("Unhandled exception: %s", exc)
    return JSONResponse(
        status_code=500,
        content={"detail": "An unexpected error occurred. Please try again."},
    )

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
