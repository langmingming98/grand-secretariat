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
- [x] Room creation UI (select LLMs from defaults)
- [x] Room join UI (display name prompt, localStorage user ID)
- [x] Real-time chat with participants sidebar
- [x] @mention autocomplete for LLMs
- [x] LLM streaming responses with thinking indicators
- [x] Typing indicators (humans)
- [ ] Thread links ("replying to" UI for LLM responses)
- [ ] Room settings / LLM persona editing
- [ ] Better error handling + reconnection on WebSocket drop

## Phase 4: Polish
- [ ] Reconnection handling (resync state on WebSocket drop)
- [ ] Load older history (scroll up pagination — LoadHistory RPC exists)
- [ ] Context management / compression for long conversations
- [ ] Interrupt LLM mid-response (proto + handler stubbed, needs cancellation)
- [ ] Autopilot mode (LLMs take turns responding)

## Phase 5: Infrastructure
- [ ] DynamoDB persistence (store interface is async, ready to swap)
- [ ] Redis pub/sub for cross-instance broadcasting
- [ ] Horizontal scaling (multiple Room Service instances behind LB)

---

## Current Status

**Completed:**
- [x] Product spec (docs/PRODUCT_SPEC.md)
- [x] CI/CD pipeline (GitHub Actions → ghcr.io → EC2, parallelized 4-way builds)
- [x] Local dev script (scripts/dev.sh)
- [x] Existing multi-model chat (working, now legacy)
- [x] Tech design doc with reviewed proto schema
- [x] Room service (gRPC, in-memory store, bidi streaming, @mention → LLM)
- [x] Gateway room endpoints (REST + WebSocket)
- [x] Room UI (create, join, chat, @mention autocomplete, streaming, typing, participants)
- [x] Docker configs for all services
- [x] Optimized Dockerfiles for layer caching
- [x] Parallelized CI/CD (4 concurrent builds)

**Next up:** Frontend polish (thread links, reconnection) or DynamoDB persistence
