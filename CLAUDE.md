# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Grand Secretariat (内阁)** - Named after the consulting cabinet to Ming dynasty emperors. A collaborative workspace where multiple humans and LLMs work together in real-time.

**Current state:** Basic multi-model chat working. Now building room-based collaboration with @mentions, threading, and real-time presence.

**Key docs:**
- `docs/PRODUCT_SPEC.md` - Product requirements and user stories
- `docs/TECH_DESIGN.md` - Architecture, WebSocket protocol, schemas
- `docs/TECHNICAL_PLAN.md` - Implementation phases and progress

## Architecture

Next.js frontend → FastAPI WebSocket gateway → gRPC chat service → OpenRouter API
                         ↓
                   Redis (real-time state) + DynamoDB (persistence)

## Common Commands

### Backend (Python with uv)

```bash
# Install all workspace dependencies (from root)
uv sync

# Start gRPC chat service (port 50051)
uv run python services/chat/src/chat/main.py

# Start Room service (port 50052)
cd services/room && uv run python src/room/main.py

# Start FastAPI gateway (port 8000)
cd services/gateway && uv run uvicorn gateway.main:app --reload --port 8000
```

### Frontend (Next.js)

```bash
cd web
npm install
npm run dev      # Development server (port 3000)
npm run build    # Production build
npm run lint     # Linting
```

### Protocol Buffers

```bash
buf generate     # Generate Python code from proto files to libs/pb/src
```

### Docker

```bash
docker-compose up    # Run all services with nginx reverse proxy
```

## Architecture

```
Frontend (Next.js :3000)
    ↓ WebSocket
Gateway (FastAPI :8000)
    ├── gRPC → Chat Service (:50051) → OpenRouter API
    └── gRPC bidi stream → Room Service (:50052) → Chat Service
```

**Key paths:**
- `web/` - Next.js frontend with React components in `app/components/`
- `services/chat/` - gRPC chat service, provider implementation in `src/chat/providers/openrouter.py`
- `services/room/` - gRPC room service (rooms, messages, @mention dispatch)
- `services/gateway/` - FastAPI gateway, WebSocket handlers in `src/gateway/main.py`
- `proto/pb/` - Protocol buffer definitions (`chat.proto`, `room.proto`)
- `libs/pb/` - Generated protobuf Python code

**Gateway endpoints:**
- `POST /api/rooms` - Create room
- `GET /api/rooms` - List rooms
- `GET /api/rooms/{id}` - Get room details
- `WS /ws/room/{id}` - Room session (bidi: join, message, typing, interrupt)
- `WS /ws/chat/stream` - Legacy single-shot chat

## Environment Variables

- `OPENROUTER_API_KEY` or `CHAT_OPENROUTER_API_KEY` - Required for AI providers
- `GRPC_HOST` / `GRPC_PORT` - Chat service address (default: localhost:50051)
- `ROOM_SERVICE_ADDRESS` - Room service gRPC address (default: localhost:50052)
- `CHAT_SERVICE_ADDRESS` - Used by room service to reach chat service (default: localhost:50051)

## Configuration

- `services/chat/config.yaml` - Model list, gRPC port, provider settings
- `services/room/config.yaml` - Room service gRPC port, chat service address
- `buf.gen.yaml` - Protobuf generation config
