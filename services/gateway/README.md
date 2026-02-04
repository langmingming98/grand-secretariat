# Web Service

FastAPI gateway service providing HTTP/WebSocket endpoints for microservices. This service acts as the web API layer for all frontend applications.

## Architecture

This service provides web-friendly endpoints (REST/WebSocket) that bridge to the internal microservices architecture (gRPC). As more microservices are added, new routers can be added here to expose their functionality via HTTP/WebSocket.

The chat streaming endpoint (`/ws/chat/stream`) calls the gRPC chat service (`/services/chat`) rather than calling OpenRouter directly, maintaining proper service boundaries.

## Current Endpoints

- `GET /health` - Health check
- `GET /` - Service info
- `WS /ws/chat/stream` - WebSocket endpoint for streaming multi-model chat responses (via gRPC)

## Setup

**Prerequisites**: The chat gRPC service must be running (see `/services/chat`).

1. Install dependencies (from project root):
```bash
uv sync
```

2. (Optional) Configure chat service address:
```bash
export CHAT_SERVICE_ADDRESS=localhost:50051  # Default
```

3. Run the service:
```bash
uvicorn web.main:app --reload --port 8000
```

Or from the project root:
```bash
cd services/web
uvicorn web.main:app --reload --port 8000
```

## Development

The service runs on port 8000 by default. CORS is configured to allow connections from `http://localhost:3000` (Next.js dev server).

## Future Expansion

As new microservices are added (e.g., `account`), add corresponding routers:

```
src/web/routers/
├── chat.py      # Chat-related endpoints
├── account.py   # Account-related endpoints (future)
└── ...
```

Then include them in `main.py`:
```python
from web.routers import chat, account

app.include_router(chat.router, prefix="/api/chat")
app.include_router(account.router, prefix="/api/account")
```

