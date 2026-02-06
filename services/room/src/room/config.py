from __future__ import annotations

from pathlib import Path
from typing import Optional

import yaml
from pydantic import BaseModel, Field


class ServerConfig(BaseModel):
    grpc_port: int = Field(50052, description="gRPC server port")


class ChatServiceConfig(BaseModel):
    address: str = Field("localhost:50051", description="Chat service gRPC address")


class AppConfig(BaseModel):
    server: ServerConfig = ServerConfig()
    chat_service: ChatServiceConfig = ChatServiceConfig()


def _default_config_path() -> Path:
    return Path(__file__).resolve().parents[2] / "config.yaml"


def load_config(path: Optional[Path | str] = None) -> AppConfig:
    import os

    config_path = Path(path) if path is not None else _default_config_path()

    if not config_path.is_file():
        config = AppConfig()
    else:
        with config_path.open("r", encoding="utf-8") as f:
            raw = yaml.safe_load(f) or {}
        config = AppConfig.model_validate(raw)

    # Environment variables override YAML config
    if addr := os.environ.get("CHAT_SERVICE_ADDRESS"):
        config.chat_service.address = addr

    return config
