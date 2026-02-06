# Technical Design: Room-Based Collaboration

## Design Principles

### Scalability-Ready Architecture

Even though we deploy single-instance initially, the design must support horizontal scaling without architectural changes:

1. **Stateless services** - No local state that can't be reconstructed from Redis/DynamoDB
2. **Redis as coordination layer** - All cross-instance communication goes through Redis pub/sub
3. **No direct instance-to-instance calls** - Services don't know about each other
4. **Local registries only** - Each instance tracks only its own connections/handlers
5. **Idempotent operations** - Messages can be safely redelivered

### Scaling Model

```
Single Instance (now)           Multi-Instance (future)
─────────────────────           ────────────────────────
┌─────────────────┐             ┌─────────────────┐  ┌─────────────────┐
│  Room Service   │             │  Room Service 1 │  │  Room Service 2 │
│  100 handlers   │     →       │   50 handlers   │  │   50 handlers   │
│                 │             │                 │  │                 │
└────────┬────────┘             └────────┬────────┘  └────────┬────────┘
         │                               │                    │
         ▼                               └─────────┬──────────┘
┌─────────────────┐                               ▼
│     Redis       │             ┌─────────────────────────────┐
└─────────────────┘             │     Redis (same)            │
                                └─────────────────────────────┘
```

**To scale:** Add instances behind load balancer. No code changes required.

### What Lives Where

| Data | Location | Why |
|------|----------|-----|
| Room metadata | DynamoDB (source of truth) + Redis (cache) | Durable + fast reads |
| Message history | DynamoDB | Must survive restarts |
| Who's online now | Redis only | Ephemeral, rebuilt on reconnect |
| Connection mapping | Local memory + Redis | Local for routing, Redis for coordination |
| Pub/sub events | Redis | Cross-instance broadcast |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Clients                                  │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐                         │
│  │ User A  │  │ User B  │  │ User C  │                         │
│  └────┬────┘  └────┬────┘  └────┬────┘                         │
└───────┼────────────┼────────────┼───────────────────────────────┘
        │            │            │
        │      WebSocket          │
        ▼            ▼            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Gateway (FastAPI)                             │
│                                                                  │
│   Responsibilities:                                              │
│   • WebSocket ↔ gRPC translation only                           │
│   • Route messages to Room Service                              │
│   • Forward events from Room Service to WebSocket clients       │
│   • NO direct Redis/DynamoDB access                             │
│                                                                  │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                          gRPC bidi stream
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Room Service (gRPC)                           │
│                                                                  │
│   ┌──────────────────┐    ┌──────────────────┐                 │
│   │ Stream Handlers  │    │ Redis Subscriber │                 │
│   │ (1 per user)     │◀───│ (1 per instance) │                 │
│   │                  │    │                  │                 │
│   │ registry:        │    │ routes events to │                 │
│   │ room→[handlers]  │    │ local handlers   │                 │
│   └────────┬─────────┘    └────────┬─────────┘                 │
│            │                       │                            │
│            ▼                       ▼                            │
│   ┌─────────────────────────────────────────┐                  │
│   │              Redis                       │                  │
│   │  • Pub/sub (cross-instance events)      │                  │
│   │  • Room state cache                      │                  │
│   │  • Online participants                   │                  │
│   └─────────────────────────────────────────┘                  │
│            │                                                    │
│            ▼                                                    │
│   ┌─────────────────────────────────────────┐                  │
│   │             DynamoDB                     │                  │
│   │  • Room metadata (source of truth)      │                  │
│   │  • Message history                       │                  │
│   │  • Participant records                   │                  │
│   └─────────────────────────────────────────┘                  │
│                                                                  │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                          gRPC (existing)
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Chat Service (gRPC)                           │
│                                                                  │
│   • LLM calls via OpenRouter                                    │
│   • Streaming responses                                         │
│   • Multi-model support                                         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow

All flows use **gRPC bidirectional streaming** between Gateway and Room Service. Gateway is a thin translation layer (WebSocket ↔ gRPC). Room Service handles all business logic, Redis, and DynamoDB.

### 1. Create Room (gRPC Unary)

```
Client                    Gateway               Room Service           Redis/DynamoDB
   │                         │                       │                     │
   │──gRPC CreateRoom()─────▶│                       │                     │
   │  {name, llms}           │                       │                     │
   │                         │──gRPC CreateRoom()───▶│                     │
   │                         │                       │──DynamoDB PutItem──▶│
   │                         │                       │  ROOM#abc META      │
   │                         │                       │──Redis SETEX───────▶│
   │                         │                       │  room:abc:meta      │
   │                         │◀──{room_id: abc}──────│                     │
   │◀──{room_id: abc}────────│                       │                     │
```

### 2. Join Room (Bidi Stream)

```
Client                    Gateway               Room Service           Redis/DynamoDB
   │                         │                       │                     │
   │══WS Connect════════════▶│                       │                     │
   │  /ws/room/abc           │══gRPC RoomSession()══▶│                     │
   │                         │  (bidi stream opens)  │                     │
   │                         │                       │                     │
   │──{type:"join",          │                       │                     │
   │   user_id, name, role}─▶│──ClientMessage{join}─▶│                     │
   │                         │                       │──Redis GET meta────▶│
   │                         │                       │◀─miss───────────────│
   │                         │                       │──DynamoDB GetItem──▶│
   │                         │                       │◀─{room meta}────────│
   │                         │                       │──Redis SETEX meta──▶│
   │                         │                       │                     │
   │                         │                       │──DynamoDB Query────▶│
   │                         │                       │  last 50 msgs       │
   │                         │                       │◀─[messages]─────────│
   │                         │                       │                     │
   │                         │                       │──Redis SADD─────────▶│
   │                         │                       │  participants       │
   │                         │                       │──Redis HINCRBY─────▶│
   │                         │                       │  connections +1     │
   │                         │                       │──DynamoDB PutItem──▶│
   │                         │                       │  PARTICIPANT#xyz    │
   │                         │                       │  (first join only)  │
   │                         │                       │                     │
   │                         │◀─ServerEvent──────────│                     │
   │◀─{type:"room_state",────│  {room_state}        │                     │
   │   participants,         │                       │                     │
   │   messages, llms}       │                       │                     │
   │                         │                       │                     │
   │                         │                       │──Redis PUBLISH─────▶│
   │                         │                       │  {user_joined}      │
   │  (to other clients)     │                       │                     │
   │                         │◀─ServerEvent──────────│◀─(all handlers)─────│
   │◀─{type:"user_joined"}───│  {user_joined}       │                     │
   │                         │                       │                     │
   │══stream stays open══════│══stream stays open═══│                     │
```

### 3. Send Message (Bidi Stream)

```
Client                    Gateway               Room Service           Redis/DynamoDB
   │                         │                       │                     │
   │══stream open════════════│══stream open══════════│                     │
   │                         │                       │                     │
   │──{type:"message",       │                       │                     │
   │   content:"hello",      │                       │                     │
   │   reply_to?}───────────▶│──ClientMessage────────▶│                     │
   │                         │  {message}            │                     │
   │                         │                       │──DynamoDB PutItem──▶│
   │                         │                       │  MSG#timestamp#uuid │
   │                         │                       │                     │
   │                         │                       │──Redis PUBLISH─────▶│
   │                         │                       │  {message_received} │
   │                         │                       │                     │
   │                         │◀─ServerEvent──────────│◀─(all handlers)─────│
   │◀─{type:"message",───────│  {message_received}  │                     │
   │   id, sender, content,  │                       │                     │
   │   timestamp}            │                       │                     │
   │                         │                       │                     │
   │  (User B, C also get)   │                       │                     │
```

### 4. @mention LLM (Bidi Stream)

```
Client                    Gateway               Room Service           Chat Service        Redis/DynamoDB
   │                         │                       │                       │                   │
   │══stream open════════════│══stream open══════════│                       │                   │
   │                         │                       │                       │                   │
   │──{type:"message",       │                       │                       │                   │
   │   content:"@claude      │                       │                       │                   │
   │   what do you think?"}─▶│──ClientMessage────────▶│                       │                   │
   │                         │  {message}            │                       │                   │
   │                         │                       │──DynamoDB PutItem────────────────────────▶│
   │                         │                       │  MSG# (user message)  │                   │
   │                         │                       │──Redis PUBLISH───────────────────────────▶│
   │                         │                       │  {message_received}   │                   │
   │                         │◀─ServerEvent──────────│◀─(all handlers)──────────────────────────│
   │◀─{type:"message"}───────│                       │                       │                   │
   │                         │                       │                       │                   │
   │                         │                       │──parse @mentions      │                   │
   │                         │                       │  found: [claude]      │                   │
   │                         │                       │──Redis PUBLISH───────────────────────────▶│
   │                         │                       │  {llm_thinking}       │                   │
   │                         │◀─ServerEvent──────────│◀─────────────────────────────────────────│
   │◀─{type:"llm_thinking",──│                       │                       │                   │
   │   llm:"claude"}         │                       │                       │                   │
   │                         │                       │                       │                   │
   │                         │                       │──gRPC Chat()─────────▶│                   │
   │                         │                       │  {messages, model}    │──OpenRouter──▶    │
   │                         │                       │                       │◀─stream──────     │
   │                         │                       │◀─stream chunk─────────│                   │
   │                         │                       │──Redis PUBLISH───────────────────────────▶│
   │                         │                       │  {llm_chunk}          │                   │
   │                         │◀─ServerEvent──────────│◀─────────────────────────────────────────│
   │◀─{type:"llm_chunk",─────│                       │                       │                   │
   │   content:"I think..."}│                       │                       │                   │
   │                         │                       │                       │                   │
   │                     ... │ (more chunks) ...    │                       │                   │
   │                         │                       │                       │                   │
   │                         │                       │◀─stream done──────────│                   │
   │                         │                       │──DynamoDB PutItem────────────────────────▶│
   │                         │                       │  MSG# (llm response)  │                   │
   │                         │                       │──Redis PUBLISH───────────────────────────▶│
   │                         │                       │  {llm_done}           │                   │
   │                         │◀─ServerEvent──────────│◀─────────────────────────────────────────│
   │◀─{type:"llm_done",──────│                       │                       │                   │
   │   llm:"claude"}         │                       │                       │                   │
```

**Threading:** LLM response includes `reply_to: <original_msg_id>` for UI linking.

---

## WebSocket Protocol

### Connection
```
ws://host/ws/room/{room_id}?user_id={user_id}&name={name}&role={role}
```

### Client → Server Messages

```typescript
// Send a chat message
{
  type: "message",
  content: "Hello @claude what do you think?",
  reply_to?: "msg_id_123"  // optional thread reference
}

// Typing indicator
{
  type: "typing",
  is_typing: boolean
}

// Interrupt LLM
{
  type: "interrupt",
  llm_id: "claude"
}
```

### Server → Client Messages

```typescript
// Room state (on join)
{
  type: "room_state",
  room: { id, name, created_at },
  participants: [{ id, name, role, type: "human" | "llm" }],
  messages: [...],  // recent history
  llms: [{ id, model, persona }]
}

// User joined/left
{
  type: "user_joined" | "user_left",
  user: { id, name, role }
}

// Chat message (human)
{
  type: "message",
  id: "msg_123",
  sender: { id, name, role, type: "human" },
  content: "Hello everyone",
  reply_to?: "msg_456",
  timestamp: 1234567890
}

// LLM response chunk (streaming)
{
  type: "llm_chunk",
  id: "msg_789",
  llm_id: "claude",
  content: "Here's what I think...",  // delta
  reply_to: "msg_123"  // the message that triggered it
}

// LLM response complete
{
  type: "llm_done",
  id: "msg_789",
  llm_id: "claude"
}

// Typing indicator
{
  type: "typing",
  user: { id, name },
  is_typing: boolean
}

// LLM thinking indicator
{
  type: "llm_thinking",
  llm_id: "claude",
  is_thinking: boolean
}

// Error
{
  type: "error",
  error: "message"
}
```

---

## Why gRPC Over REST

| Aspect | REST | gRPC |
|--------|------|------|
| Payload size | JSON (~10x larger) | Protobuf (compact) |
| Type safety | Runtime validation | Compile-time generated |
| Streaming | Hacky (SSE, long-poll) | Native bidirectional |
| Browser support | Native | Needs WebSocket bridge |

**Our approach:** WebSocket for browser ↔ Gateway (browser limitation), gRPC for everything else.

This demonstrates the tradeoff: more complexity, but faster UX and proper streaming support.

---

## DynamoDB Schema

### Table: grand-secretariat

**Single-table design** with composite keys:

| PK | SK | Attributes |
|----|----|----|
| `ROOM#abc123` | `META` | name, created_at, created_by, llm_configs[] |
| `ROOM#abc123` | `MSG#1706000001000#uuid` | sender_id, sender_name, sender_type, content, reply_to, mentions[], quotes[] |
| `ROOM#abc123` | `PARTICIPANT#user-xyz` | display_name, role, joined_at, last_seen |
| `ROOM#abc123` | `LLM#claude` | model_id, persona, display_name |
| `USER#user-xyz` | `ROOM#abc123` | role, last_accessed |

### Access Patterns

| Pattern | Query |
|---------|-------|
| Get room metadata | PK=`ROOM#abc123`, SK=`META` |
| List messages (sorted) | PK=`ROOM#abc123`, SK begins_with `MSG#` |
| List participants | PK=`ROOM#abc123`, SK begins_with `PARTICIPANT#` |
| List LLMs in room | PK=`ROOM#abc123`, SK begins_with `LLM#` |
| User's room history | PK=`USER#user-xyz`, SK begins_with `ROOM#` |

---

## Redis Data Structures

### Room State (ephemeral)
```
room:{room_id}:participants    SET     {user_id_1, user_id_2, ...}
room:{room_id}:connections     HASH    {user_id: connection_id}
room:{room_id}:typing          SET     {user_id_1, ...}  (with TTL)
room:{room_id}:llm_thinking    SET     {llm_id_1, ...}
```

### Pub/Sub Channels
```
room:{room_id}    →  all room events (messages, joins, typing, etc.)
```

### Connection Mapping
```
conn:{connection_id}           HASH    {user_id, room_id, connected_at}
```

---

## Proto Definitions

Source of truth: `proto/pb/api/room/room.proto`

### Key design decisions (from review)

- **Enums over strings** for `ParticipantType` (HUMAN/LLM) and `Role` (ADMIN/MEMBER/VIEWER)
- **`LLMConfig.id`** added as stable identifier (distinct from display_name)
- **`RoomInfo`** extracted as shared message (used by RoomState, GetRoomResponse, ListRoomsResponse)
- **`google.protobuf.Timestamp`** instead of raw uint64
- **`message_id`** consistently used (not `id`) across Message, LLMChunk, LLMDone
- **`ListRooms` / `LoadHistory`** RPCs added with cursor-based pagination
- **`Ping`/`Pong`** added for application-level keepalive
- **`InterruptLLM.message_id`** added to disambiguate concurrent LLM responses
- **1 stream = 1 room** invariant: JoinRoom must be first ClientMessage on stream

### room.proto
```protobuf
service Room {
  // Unary RPCs
  rpc CreateRoom(CreateRoomRequest) returns (CreateRoomResponse);
  rpc GetRoom(GetRoomRequest) returns (GetRoomResponse);
  rpc ListRooms(ListRoomsRequest) returns (ListRoomsResponse);
  rpc LoadHistory(LoadHistoryRequest) returns (LoadHistoryResponse);

  // Bidirectional streaming - main session
  // One stream per room per user. JoinRoom must be the first ClientMessage.
  rpc RoomSession(stream ClientMessage) returns (stream ServerEvent);
}

enum ParticipantType {
  PARTICIPANT_TYPE_UNSPECIFIED = 0;
  HUMAN = 1;
  LLM = 2;
}

enum Role {
  ROLE_UNSPECIFIED = 0;
  ADMIN = 1;
  MEMBER = 2;
  VIEWER = 3;
}

message LLMConfig {
  string id = 1;              // stable identifier, e.g. "claude-1"
  string model = 2;           // OpenRouter model id
  string persona = 3;         // system prompt / role description
  string display_name = 4;    // human-readable, e.g. "Claude"
}

message Participant {
  string id = 1;
  string name = 2;
  Role role = 3;
  ParticipantType type = 4;
}

message RoomInfo {
  string room_id = 1;
  string name = 2;
  google.protobuf.Timestamp created_at = 3;
  string created_by = 4;
  repeated LLMConfig llms = 5;
}

message Message {
  string message_id = 1;
  string sender_id = 2;
  string sender_name = 3;
  ParticipantType sender_type = 4;
  string content = 5;
  optional string reply_to = 6;
  google.protobuf.Timestamp timestamp = 7;
}

// --- Unary RPCs ---

message CreateRoomRequest {
  string name = 1;
  repeated LLMConfig llms = 2;
  string created_by = 3;       // from auth context in production
}

message CreateRoomResponse { string room_id = 1; }

message GetRoomRequest { string room_id = 1; }

message GetRoomResponse {
  RoomInfo room = 1;
  repeated Participant participants = 2;
}

message ListRoomsRequest {
  optional string user_id = 1;    // filter to user's rooms; empty = all
  uint32 limit = 2;               // default 20
  optional string cursor = 3;
}

message ListRoomsResponse {
  repeated RoomInfo rooms = 1;
  optional string next_cursor = 2;
}

message LoadHistoryRequest {
  string room_id = 1;
  uint32 limit = 2;               // default 50
  optional string cursor = 3;     // opaque; MSG# sort key
}

message LoadHistoryResponse {
  repeated Message messages = 1;
  optional string next_cursor = 2;
}

// --- Bidi Stream: Client → Server ---

message ClientMessage {
  oneof payload {
    JoinRoom join = 1;
    SendMessage message = 2;
    TypingIndicator typing = 3;
    InterruptLLM interrupt = 4;
    Ping ping = 5;
  }
}

message JoinRoom {
  string room_id = 1;
  string user_id = 2;        // client-generated for anon; server validates when auth exists
  string display_name = 3;
  Role role = 4;
}

message SendMessage {
  string content = 1;
  repeated string mentions = 2;    // client-parsed; server re-validates against room LLMs
  optional string reply_to = 3;
}

message TypingIndicator { bool is_typing = 1; }

message InterruptLLM {
  string llm_id = 1;
  optional string message_id = 2; // disambiguate concurrent responses
}

message Ping {}

// --- Bidi Stream: Server → Client ---

message ServerEvent {
  oneof payload {
    RoomState room_state = 1;
    MessageReceived message_received = 2;
    UserJoined user_joined = 3;
    UserLeft user_left = 4;
    LLMThinking llm_thinking = 5;
    LLMChunk llm_chunk = 6;
    LLMDone llm_done = 7;
    UserTyping user_typing = 8;
    Error error = 9;
    Pong pong = 10;
  }
}

message RoomState {
  RoomInfo room = 1;
  repeated Participant participants = 2;
  repeated Message messages = 3;
}

message MessageReceived { Message message = 1; }
message UserJoined { Participant user = 1; }
message UserLeft { string user_id = 1; }

message LLMThinking { string llm_id = 1; string reply_to = 2; }
message LLMChunk { string message_id = 1; string llm_id = 2; string content = 3; string reply_to = 4; }
message LLMDone { string message_id = 1; string llm_id = 2; }

message UserTyping { string user_id = 1; string user_name = 2; bool is_typing = 3; }
message Error { string code = 1; string message = 2; }
message Pong {}
```

---

## Implementation Notes

### Gateway (Thin Layer)
- In-memory dict: `user_id → WebSocket`
- On WebSocket connect: open gRPC bidi stream to Room Service
- Translate WebSocket messages → ClientMessage
- Translate ServerEvent → WebSocket messages
- No business logic, no direct Redis/DynamoDB access

### Room Service Stream Handler

Each gRPC stream has a handler with an async queue for outbound events:

```python
class StreamHandler:
    def __init__(self, stream, room_id: str, user_id: str):
        self.stream = stream
        self.room_id = room_id
        self.user_id = user_id
        self.outbound_queue = asyncio.Queue()

    async def send_event(self, event: ServerEvent):
        """Called by Redis subscriber to queue outbound event"""
        await self.outbound_queue.put(event)

    async def run(self):
        """Main loop - listens to both client AND queue"""
        async def read_client():
            async for msg in self.stream:
                await self.handle_client_message(msg)

        async def read_queue():
            while True:
                event = await self.outbound_queue.get()
                await self.stream.send(event)

        await asyncio.gather(read_client(), read_queue())
```

### Room Service Event Routing

One Redis subscriber per instance routes events to local handlers:

```python
# Registry: room_id → list of handlers on THIS instance
registry: dict[str, list[StreamHandler]] = {}

async def on_redis_message(channel: str, event: dict):
    room_id = channel.split(":")[1]  # "room:abc" → "abc"
    for handler in registry.get(room_id, []):
        await handler.send_event(event)
```

### @mention Parsing
- Regex: `@(\w+)` to extract mentions
- Match against room's LLM configs (by display_name or id)
- If LLM mentioned: call Chat Service gRPC, stream chunks back
- Each chunk published to Redis → all room members see streaming

### Message Threading
- Messages have optional `reply_to` field
- LLM responses always set `reply_to` to the triggering message
- Frontend renders thread link, click to scroll

### Multi-Tab Support
- `room:abc:connections` HASH tracks `{user_id: connection_count}`
- `HINCRBY +1` on connect, `-1` on disconnect
- Remove from participants SET only when count reaches 0
