"""Gateway routers for REST endpoints."""

from gateway.routers.rooms import router as rooms_router
from gateway.routers.models import router as models_router

__all__ = ["rooms_router", "models_router"]
