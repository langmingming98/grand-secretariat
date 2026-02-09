# Room Service

The room service manages collaborative rooms where humans and LLMs interact in real-time.

## Architecture

```
RoomSession (bidi gRPC stream)
    ↓
StreamHandler (one per connected user)
    ├── reads client messages → dispatches to handlers
    ├── writes server events ← outbound queue
    └── LLMDispatcher → Chat Service (for @mentions and polls)
```

**Key modules:**
- `session.py` - StreamHandler class, handles the bidi stream per user
- `store.py` - MemoryStore with async interface (swap point for DynamoDB)
- `registry.py` - HandlerRegistry maps rooms to handlers (swap point for Redis pub/sub)
- `llm_dispatcher.py` - Manages LLM calls via Chat Service, streaming responses back
- `service.py` - gRPC servicer implementing RoomService RPC methods

## Data Flow

### @mention Flow
1. User sends message with `@claude` mention
2. StreamHandler stores message, broadcasts to room
3. LLMDispatcher.dispatch_mentions() finds matching LLM configs
4. For each mentioned LLM:
   - Broadcasts `llm_thinking` event
   - Calls Chat Service with message history + system prompt
   - Streams `llm_chunk` events as tokens arrive
   - Broadcasts final message + `llm_done` event

### Poll Flow
1. User creates poll via `create_poll` message
2. StreamHandler creates poll in store, broadcasts `poll_created`
3. LLMDispatcher.dispatch_poll_voting() triggers all LLMs to vote
4. Each LLM uses tool calls to cast votes with reasoning
5. Votes broadcast as `poll_voted` events

## Swap Points for Persistence

### DynamoDB (replace MemoryStore)
The store interface is fully async. To swap:
1. Create `DynamoStore` implementing same methods as `MemoryStore`
2. Update `service.py` to instantiate `DynamoStore`
3. Converters (`message_to_proto`, etc.) stay in store class

### Redis Pub/Sub (replace HandlerRegistry)
The registry handles local broadcast. For multi-instance:
1. Create `RedisRegistry` that publishes events to Redis channels
2. Subscribe to room channels, dispatch to local handlers
3. `broadcast()` becomes publish; local `_handlers` receives from subscriber

## Configuration

`config.yaml`:
- `grpc.host/port` - Room service listen address
- `chat_service.address` - Chat service gRPC address for LLM dispatch

Environment overrides: `GRPC_HOST`, `GRPC_PORT`, `CHAT_SERVICE_ADDRESS`

## Proto Schema

See `proto/pb/api/room/room.proto`:
- `RoomSession` - bidi stream RPC
- `ClientMessage` - union of join, message, typing, interrupt, add_llm, etc.
- `ServerEvent` - union of room_state, message_received, llm_chunk, etc.

## Running

```bash
cd services/room && uv run python src/room/main.py
```

Port: 50052 (default)
