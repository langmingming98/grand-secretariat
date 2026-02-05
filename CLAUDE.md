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
    ↓ gRPC
Chat Service (:50051)
    ↓ HTTP
OpenRouter API
```

**Key paths:**
- `web/` - Next.js frontend with React components in `app/components/`
- `services/chat/` - gRPC chat service, provider implementation in `src/chat/providers/openrouter.py`
- `services/gateway/` - FastAPI gateway, WebSocket handler in `src/gateway/routers/chat.py`
- `proto/pb/` - Protocol buffer definitions
- `libs/pb/` - Generated protobuf Python code

**WebSocket message types:** `content`, `usage`, `done`, `error`

## Environment Variables

- `OPENROUTER_API_KEY` or `CHAT_OPENROUTER_API_KEY` - Required for AI providers
- `GRPC_HOST` / `GRPC_PORT` - Chat service address (default: localhost:50051)

## Configuration

- `services/chat/config.yaml` - Model list, gRPC port, provider settings
- `buf.gen.yaml` - Protobuf generation config
