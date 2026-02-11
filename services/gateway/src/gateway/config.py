"""Gateway configuration with Pydantic models.

Follows the same pattern as room and chat services:
- Load from YAML file
- Override with environment variables
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

import yaml
from pydantic import BaseModel, Field


class ServerConfig(BaseModel):
    """HTTP server configuration."""
    host: str = Field("0.0.0.0", description="Server bind address")
    port: int = Field(8000, description="Server port")


class CorsConfig(BaseModel):
    """CORS configuration."""
    origins: list[str] = Field(
        default_factory=lambda: ["http://localhost:3000"],
        description="Allowed origins for CORS",
    )
    allow_credentials: bool = Field(True, description="Allow credentials")


class ChatServiceConfig(BaseModel):
    """Chat gRPC service configuration."""
    host: str = Field("localhost", description="Chat service host")
    port: int = Field(50051, description="Chat service port")

    @property
    def address(self) -> str:
        return f"{self.host}:{self.port}"


class RoomServiceConfig(BaseModel):
    """Room gRPC service configuration."""
    host: str = Field("localhost", description="Room service host")
    port: int = Field(50052, description="Room service port")

    @property
    def address(self) -> str:
        return f"{self.host}:{self.port}"


class AppConfig(BaseModel):
    """Application configuration."""
    server: ServerConfig = Field(default_factory=ServerConfig)
    cors: CorsConfig = Field(default_factory=CorsConfig)
    chat_service: ChatServiceConfig = Field(default_factory=ChatServiceConfig)
    room_service: RoomServiceConfig = Field(default_factory=RoomServiceConfig)


def _default_config_path() -> Path:
    return Path(__file__).resolve().parents[2] / "config.yaml"


def load_config(path: Optional[Path | str] = None) -> AppConfig:
    """Load configuration from YAML file and environment variables.

    Environment variables take precedence over YAML values:
    - GRPC_HOST / GRPC_PORT: Chat service address
    - CHAT_SERVICE_ADDRESS: Full chat service address (overrides host/port)
    - ROOM_SERVICE_ADDRESS: Full room service address
    """
    config_path = Path(path) if path is not None else _default_config_path()

    if not config_path.is_file():
        config = AppConfig()
    else:
        with config_path.open("r", encoding="utf-8") as f:
            raw = yaml.safe_load(f) or {}
        config = AppConfig.model_validate(raw)

    # Environment variables override YAML config
    if host := os.environ.get("GRPC_HOST"):
        config.chat_service.host = host
    if port := os.environ.get("GRPC_PORT"):
        config.chat_service.port = int(port)

    # Full address overrides take precedence
    if addr := os.environ.get("CHAT_SERVICE_ADDRESS"):
        if ":" in addr:
            host, port = addr.rsplit(":", 1)
            config.chat_service.host = host
            config.chat_service.port = int(port)

    if addr := os.environ.get("ROOM_SERVICE_ADDRESS"):
        if ":" in addr:
            host, port = addr.rsplit(":", 1)
            config.room_service.host = host
            config.room_service.port = int(port)

    return config
