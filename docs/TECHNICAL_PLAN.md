# Technical Implementation Plan

## Phase 1: Foundation
- [x] Tech design doc (architecture, data flow, API contracts)
- [x] DynamoDB schema + Redis data structures (designed; in-memory store for now)
- [ ] Set up DynamoDB table (AWS)
- [ ] Set up Redis on EC2

## Phase 2: Backend (Room Infrastructure)
- [x] Room service protos (CreateRoom, GetRoom, ListRooms, LoadHistory, RoomSession bidi)
- [x] Room service implementation (in-memory store, handler registry, bidi streaming)
- [x] Gateway: WebSocket room endpoint (`/ws/room/{id}`) + REST API (`/api/rooms`)
- [x] Connection manager (handler registry: room → active stream handlers)
- [x] Message persistence (in-memory; DynamoDB swap-in ready)
- [x] Broadcast messages to room members
- [x] @mention parsing → trigger LLM via chat service
- [ ] Swap in DynamoDB for persistence
- [ ] Swap in Redis for pub/sub + ephemeral state

## Phase 3: Frontend (Feature by Feature)
- [ ] Room creation UI (select LLMs, set personas)
- [ ] Room join UI (via URL, set display name/role)
- [ ] Real-time chat with participants list
- [ ] @mention autocomplete for LLMs
- [ ] LLM responses with "replying to" thread links
- [ ] Typing indicators (humans) + thinking indicators (LLMs)

## Phase 4: Polish
- [ ] Reconnection handling (resync state on WebSocket drop)
- [ ] Chat history retrieval (load on room join)
- [ ] Context management / compression
- [ ] Interrupt LLM mid-response
- [ ] Autopilot mode (LLMs take turns)

---

## Current Status

**Completed:**
- [x] Product spec (docs/PRODUCT_SPEC.md)
- [x] CI/CD pipeline (GitHub Actions → ghcr.io → EC2)
- [x] Local dev script (scripts/dev.sh)
- [x] Existing multi-model chat (working but single-user, no rooms)
- [x] Tech design doc with reviewed proto schema
- [x] Room service (gRPC, in-memory store, bidi streaming, @mention → LLM)
- [x] Gateway room endpoints (REST + WebSocket)
- [x] Docker configs for room service

**Next up:** Phase 3 - Frontend room UI
