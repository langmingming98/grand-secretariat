"""Model catalog REST API endpoint."""

import logging
import time

import httpx
from fastapi import APIRouter, Query

from gateway.models import ListModelsResponse, ModelInfo

router = APIRouter(prefix="/api/models", tags=["models"])

logger = logging.getLogger(__name__)

# Cache for OpenRouter models
_models_cache: dict = {"data": None, "ts": 0}
_MODELS_CACHE_TTL = 600  # 10 minutes


@router.get("", response_model=ListModelsResponse)
async def list_models(
    q: str = Query(default=""),
    tools_only: bool = Query(default=True),
) -> ListModelsResponse:
    """Search OpenRouter model catalog. Cached for 10 minutes.

    Args:
        q: Search query to filter by model ID or name.
        tools_only: If True (default), only return models that support tool use.
    """
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

    # Filter for tool-capable models (default behavior)
    if tools_only:
        models = [
            m for m in models if m.get("supported_features", {}).get("tool_use", False)
        ]

    if q:
        q_lower = q.lower()
        models = [
            m
            for m in models
            if q_lower in m.get("id", "").lower() or q_lower in m.get("name", "").lower()
        ]

    # Return a slim response (top 50)
    return ListModelsResponse(
        models=[ModelInfo(id=m.get("id", ""), name=m.get("name", "")) for m in models[:50]]
    )
