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
- [x] Thread links / reply-to (quoted preview, click to scroll, reply bar above input)
- [x] Slack-style left-aligned messages (own messages have blue border)
- [x] Unified participant sidebar (green=human, blue=LLM, yellow=streaming)
- [x] Show model name alongside persona name in sidebar + message headers
- [x] @all / @everyone triggers all LLMs; human users in mention dropdown
- [x] Copy room link button
- [x] Display name editing (pencil icon, reconnects with new name)
- [x] Self shown in participant list with "(you)"
- [x] Participant titles (e.g. "VP Engineering") on LLMs and humans
- [x] Add LLM mid-chat ("+" button in sidebar)
- [x] Edit LLM model/persona/title mid-chat (gear icon in sidebar)
- [x] LLM response no longer prefixes own name
- [ ] Room settings page (dedicated settings UI)
- [x] Better error handling + reconnection on WebSocket drop
- [ ] UI theme toggle (chat-style vs professional/Slack-style)

## Phase 4: Polish
- [x] Reconnection handling (resync state on WebSocket drop)
- [x] Load older history (scroll up pagination — LoadHistory RPC exists)
- [ ] Context management / compression for long conversations
- [x] Interrupt LLM mid-response (proto + handler stubbed, needs cancellation)
- [x] Room-wide context/description field (injected into all LLM system prompts)
- [ ] Presets system (predefined personas with optional model, pre-built rooms with participant configs)

## Phase 5: Infrastructure
- [ ] DynamoDB persistence (store interface is async, ready to swap)
- [ ] Redis pub/sub for cross-instance broadcasting
- [ ] Horizontal scaling (multiple Room Service instances behind LB)

---

## Tech Debt Backlog

Operational and codebase debt discovered during implementation and testing. This backlog is intended to be actionable (each item has a concrete “done” condition).

### Security / Safety
- [ ] **Remove committed private key material** (`chat-backend-key.pem` at repo root)
- [ ] **Done means:** key rotated/replaced, file removed from repo, `.gitignore` updated, and git history rewritten if this repo will ever be shared.

### Reliability / Correctness
- [ ] **Fix provider fan-out message consumption bug** (`services/chat/src/chat/providers/openrouter.py`)
- [ ] **Done means:** `messages` is materialized once (or treated as a sequence) so multi-model calls receive identical prompt history; add a small unit/regression test or a script-level check.

- [ ] **Add backpressure / bounded buffering to room stream outbound** (`services/room/src/room/session.py`)
- [ ] **Done means:** outbound queue is bounded and/or slow clients are disconnected gracefully; document behavior.

- [x] **Implement interrupt cancellation** (`services/room/src/room/session.py`, `services/chat`)
- [x] **Done means:** interrupt reliably stops streaming for the targeted response and releases tasks; add an integration test or a reproducible script.

### Developer Experience
- [x] **Fix local dev script to start all required services** (`scripts/dev.sh`)
- [x] **Done means:** `scripts/dev.sh` starts `chat`, `room`, `gateway`, and `web`, prints their ports, and Ctrl+C stops all of them.

- [ ] **Make frontend lint non-interactive** (`web/`)
- [ ] **Done means:** `npm run lint` does not prompt for setup and can run in CI; add ESLint config if needed.

### Observability / Debuggability
- [ ] **Improve gateway error handling and logs for WS bridge** (`services/gateway/src/gateway/main.py`)
- [ ] **Done means:** errors are logged with enough context to diagnose (room id, message type); client receives consistent error codes/messages; no broad exception swallowing.

### Scaling Readiness
- [ ] **Harden in-memory store behavior under long sessions** (`services/room/src/room/store.py`)
- [ ] **Done means:** memory growth is bounded (eviction, pagination-only retention, or persistence), and the policy is documented.

---

## Ideas Backlog

Collected feature ideas for future consideration.

### LLM Response Opt-Out ✅
Allow models to decline responding in certain situations.
- **Use case 1 (persona-driven):** Character is "upset" or persona chooses silence as a response
- **Use case 2 (indirect mention):** When mentioned alongside another LLM (e.g. "@A what do you think of @B?"), B can opt out if not directly addressed
- **Implementation:** Exposed as `opt_out` tool that LLMs can call. Clean tool-based approach instead of regex parsing.

### LLM-to-LLM Mentions ✅
Models can @mention other models or users in their responses, triggering chain reactions.
- **Implementation:** Exposed as `mention` tool that LLMs can call with participant name
- **Backend:** Handles tool call and triggers mentioned LLMs to respond
- **Use case:** Collaborative workflows where models hand off to each other ("@Trevor can you review this architecture?")

### Autopilot Mode
LLMs take turns responding without human prompting.
- Round-robin or AI-decided turn order
- Configurable stopping conditions (time, message count, consensus reached)
- Human can interject or stop at any time

### Orchestration Modes
Different conversation patterns (see PRODUCT_SPEC.md P2):
- **Debate:** Two models argue opposing positions
- **Round-robin:** Each model speaks in turn
- **Relay:** One model hands off to next
- **Consensus:** Models discuss until agreement

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
- [x] Room-wide context/description field

**Next up:**
- LLM-to-LLM mentions (enables collaborative model workflows)
- Presets system (reusable persona/room templates)
- Context management for long conversations
- DynamoDB persistence / Redis pub/sub

---

## Prioritization Rationale (Summary)

- I prioritized items that can cause data loss/security incidents or undefined behavior under normal use (secrets in repo, concurrency/cancellation, unbounded queues).
- Next were “chronic pain” dev-experience issues that repeatedly caused broken local runs (missing services in `scripts/dev.sh`, interactive lint).
- Finally, I grouped debuggability and scaling-readiness items that aren’t immediately blocking but compound over time (logging, memory growth, fan-out correctness).
