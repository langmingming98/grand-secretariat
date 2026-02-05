# Technical Implementation Plan

## Phase 1: Foundation
- [ ] Tech design doc (architecture, data flow, API contracts)
- [ ] DynamoDB schema + Redis data structures
- [ ] Set up DynamoDB table (AWS)
- [ ] Set up Redis on EC2

## Phase 2: Backend (Room Infrastructure)
- [ ] Room service protos (CreateRoom, JoinRoom, LeaveRoom, SendMessage)
- [ ] Gateway: persistent WebSocket with room routing
- [ ] Connection manager (track which WebSocket → which room)
- [ ] Message persistence to DynamoDB
- [ ] Broadcast messages to room members
- [ ] @mention parsing → trigger LLM via chat service

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

**Next up:** Phase 1 - Tech design doc
