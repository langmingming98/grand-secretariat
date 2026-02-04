from __future__ import annotations

from pathlib import Path
from typing import List, Optional

import yaml
from pydantic import BaseModel, Field, ValidationError


class GrpcConfig(BaseModel):
    port: int = Field(50051, description="gRPC server port")


class ServerConfig(BaseModel):
    grpc: GrpcConfig = GrpcConfig()


class OpenRouterProviderConfig(BaseModel):
    enabled: bool = True
    base_url: Optional[str] = Field(
        default=None,
        description="Override base URL for OpenRouter; uses library default when omitted.",
    )
    timeout: float = Field(60.0, description="HTTP timeout in seconds")
    default_max_tokens: int = Field(
        4096, description="Default max_tokens when not specified in request"
    )
    default_models: List[str] = Field(
        default_factory=lambda: [
            "openai/gpt-5-mini",
            "anthropic/claude-haiku-4.5",
            "google/gemini-2.5-flash",
            "x-ai/grok-4.1-fast"
        ],
        description="Models to call when request.models is empty",
    )
    default_reasoning_effort: str = Field(
        "minimal",
        description="Default reasoning effort for providers that support reasoning",
    )


class ProvidersConfig(BaseModel):
    openrouter: OpenRouterProviderConfig = OpenRouterProviderConfig()


class AppConfig(BaseModel):
    server: ServerConfig = ServerConfig()
    providers: ProvidersConfig = ProvidersConfig()


def _default_config_path() -> Path:
    """
    Resolve the default config.yaml path relative to this file.
    """
    return Path(__file__).resolve().parents[2] / "config.yaml"


def load_config(path: Optional[Path | str] = None) -> AppConfig:
    """
    Load application configuration from YAML into a strongly-typed Pydantic model.

    If `path` is not provided, `config.yaml` in the service root is used.
    """
    config_path = Path(path) if path is not None else _default_config_path()

    if not config_path.is_file():
        # Return defaults if no config file is present; this keeps the service
        # runnable in development and test environments.
        return AppConfig()

    raw: dict
    with config_path.open("r", encoding="utf-8") as f:
        loaded = yaml.safe_load(f) or {}
        if not isinstance(loaded, dict):
            raise ValueError(f"Config at {config_path} must be a mapping.")
        raw = loaded

    try:
        return AppConfig.model_validate(raw)
    except ValidationError as exc:
        # Re-raise with a slightly nicer message; the underlying exception will
        # still include full detail.
        raise ValueError(f"Invalid configuration in {config_path}: {exc}") from exc


