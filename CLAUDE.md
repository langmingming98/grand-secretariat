# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Grand Secretariat (内阁)** - Named after the consulting cabinet to Ming dynasty emperors. A collaborative workspace where multiple humans and LLMs work together in real-time.

**Current state:** Room-based collaboration is working end-to-end. Users can create rooms, invite LLMs, chat in real-time with @mentions triggering LLM responses. Using in-memory storage (no Redis/DynamoDB yet).

**Key docs:**
- `docs/PRODUCT_SPEC.md` - Product requirements and user stories
- `docs/TECH_DESIGN.md` - Architecture, WebSocket protocol, proto schemas, DynamoDB/Redis designs
- `docs/TECHNICAL_PLAN.md` - Implementation phases and progress

## Architecture

```
Frontend (Next.js :3000)
    ↓ WebSocket / REST
Gateway (FastAPI :8000)
    ├── gRPC → Chat Service (:50051) → OpenRouter API
    └── gRPC bidi stream → Room Service (:50052) → Chat Service
```

**Services:**
- `services/chat/` - gRPC chat service. Streams LLM responses from OpenRouter. Provider pattern in `src/chat/providers/openrouter.py`
- `services/room/` - gRPC room service. Manages rooms, messages, participants, @mention dispatch. In-memory store (async interface ready for DynamoDB swap). Handler registry for broadcasting (ready for Redis pub/sub swap)
- `services/gateway/` - FastAPI gateway. Translates WebSocket JSON ↔ gRPC protobuf. All endpoints in `src/gateway/main.py`
- `web/` - Next.js frontend. Room list, room chat with streaming LLM responses, @mention autocomplete, typing indicators

**Proto definitions:** `proto/pb/api/room/room.proto`, `proto/pb/api/chat/chat.proto`, `proto/pb/shared/content.proto`
**Generated stubs:** `libs/pb/src/pb/`

**Gateway endpoints:**
- `POST /api/rooms` - Create room
- `GET /api/rooms` - List rooms
- `GET /api/rooms/{id}` - Get room details + online participants
- `WS /ws/room/{id}` - Room session (bidi: join, message, typing, interrupt, ping)
- `WS /ws/chat/stream` - Legacy single-shot multi-model chat

## Common Commands

```bash
# Install all workspace dependencies (from root)
uv sync

# Start all backend services for local dev
# IMPORTANT: chat service needs .env sourced for the OpenRouter API key
cd services/chat && source .env && export OPENROUTER_API_KEY && uv run python src/chat/main.py  # port 50051
cd services/room && uv run python src/room/main.py          # port 50052
cd services/gateway && uv run uvicorn gateway.main:app --reload --port 8000

# Frontend
cd web && npm run dev        # port 3000
cd web && npm run build      # production build

# Proto generation
buf generate                 # generates Python stubs to libs/pb/src

# Docker (all services + nginx)
docker-compose up            # local dev (builds from source)
docker-compose -f docker-compose.prod.yml up  # production (pre-built images)
```

## Environment Variables

- `OPENROUTER_API_KEY` or `CHAT_OPENROUTER_API_KEY` - Required for LLM providers
- `GRPC_HOST` / `GRPC_PORT` - Chat service address (default: localhost:50051)
- `ROOM_SERVICE_ADDRESS` - Room service gRPC address (default: localhost:50052)
- `CHAT_SERVICE_ADDRESS` - Used by room service to reach chat service (default: localhost:50051)

## Configuration

- `services/chat/config.yaml` - Model list, gRPC port, provider settings
- `services/room/config.yaml` - Room service gRPC port, chat service address
- `buf.gen.yaml` - Protobuf generation config

## CI/CD

GitHub Actions workflow (`.github/workflows/deploy.yml`):
- **4 parallel Docker builds** (chat, room, gateway, web) → push to ghcr.io
- **Deploy** to EC2 via SSH after all builds complete
- Docker layer caching via GHA cache (dep-install layers cached separately from source)

## What's Next

See `docs/TECHNICAL_PLAN.md` for full status. Key remaining work:

**Persistence (Phase 2 remaining):**
- Swap in DynamoDB for rooms/messages/participants (store interface is async, ready to swap)
- Swap in Redis for pub/sub + ephemeral state (handler registry is the swap point)

**Frontend polish (Phase 3 remaining):**
- Thread links ("replying to" UI for LLM responses)
- Better error handling and reconnection on WebSocket drop
- Room settings / LLM persona editing

**Phase 4:**
- Reconnection with state resync
- Load older history (scroll up pagination — `LoadHistory` RPC already exists)
- Context management / compression for long conversations
- Interrupt LLM mid-response (proto + handler stubbed, needs Chat Service cancellation)
- Autopilot mode (LLMs take turns responding)
