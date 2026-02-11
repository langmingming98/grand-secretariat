# Gateway Service

FastAPI gateway that bridges frontend (REST/WebSocket) to backend gRPC services.

## Architecture

```
Frontend (Next.js)
    ↓ HTTP/WebSocket
Gateway (FastAPI :8000)
    ├── REST endpoints → gRPC unary calls
    └── WebSocket → gRPC bidi streams
```

## Endpoints

### REST (Room Management)
- `POST /api/rooms` - Create room with LLM configs
- `GET /api/rooms` - List rooms (paginated)
- `GET /api/rooms/{id}` - Get room details + participants

### REST (Model Catalog)
- `GET /api/models?q=&tools_only=true` - Search OpenRouter models (cached 10min)

### WebSocket
- `/ws/room/{room_id}` - Room session (bidi: join → room_state, message, typing, etc.)
- `/ws/chat/stream` - Legacy single-shot multi-model chat (deprecated)

## Proto → JSON Conversion

The gateway translates between protobuf and JSON at the boundary:

### Enums
Protobuf uses integers, frontend expects strings:
- `ParticipantType`: `room_pb2.LLM` (1) → `"llm"`, `room_pb2.HUMAN` (0) → `"human"`
- `Role`: `room_pb2.ADMIN` (1) → `"admin"`, etc.
- `PollStatus`: `room_pb2.POLL_OPEN` (0) → `"open"`

Conversion happens in `_message_to_json()`, `_poll_to_json()`, and `_server_event_to_json()`.

### Timestamps
- WebSocket events: milliseconds (`.ToMilliseconds()`)
- REST responses: ISO 8601 string (`.ToJsonString()`)

This inconsistency is intentional - WebSocket uses epoch ms for efficient JS parsing, REST uses ISO for readability.

## Key Functions

- `_server_event_to_json()` - Translates all ServerEvent variants to WebSocket JSON
- `_message_to_json()` - Message proto → JSON with sender type conversion
- `_poll_to_json()` - Poll proto → JSON with status/type conversions
- `_to_protobuf_messages()` - Chat message dicts → protobuf (legacy endpoint)

## WebSocket Protocol

### Client → Server (JSON)
```json
{"type": "join", "user_id": "...", "name": "...", "role": "member"}
{"type": "message", "content": "Hello @claude", "mentions": ["claude"]}
{"type": "typing", "is_typing": true}
{"type": "add_llm", "llm": {...}}
{"type": "create_poll", "question": "...", "options": [...]}
{"type": "cast_vote", "poll_id": "...", "option_ids": [...]}
```

### Server → Client (JSON)
```json
{"type": "room_state", "room": {...}, "participants": [...], "messages": [...]}
{"type": "message", "id": "...", "sender": {...}, "content": "..."}
{"type": "llm_thinking", "llm_id": "..."}
{"type": "llm_chunk", "llm_id": "...", "content": "..."}
{"type": "poll_voted", "poll_id": "...", "vote": {...}}
```

## Configuration

`config.yaml`:
- `room_service.address` - Room service gRPC address
- `chat_service.address` - Chat service gRPC address
- `cors.origins` - Allowed CORS origins

Environment overrides: `ROOM_SERVICE_ADDRESS`, `CHAT_SERVICE_ADDRESS`

## Running

```bash
cd services/gateway && uv run uvicorn gateway.main:app --reload --port 8000
```

Port: 8000 (default)
