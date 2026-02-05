# Technical Design: Room-Based Collaboration

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Clients                                  │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐                         │
│  │ User A  │  │ User B  │  │ User C  │                         │
│  └────┬────┘  └────┬────┘  └────┬────┘                         │
└───────┼────────────┼────────────┼───────────────────────────────┘
        │            │            │
        │ WebSocket (persistent)  │
        ▼            ▼            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Gateway (FastAPI)                             │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Connection Manager                            │  │
│  │  ┌─────────────────────────────────────────────────────┐ │  │
│  │  │  room_abc123 → [ws_user_a, ws_user_b]              │ │  │
│  │  │  room_xyz789 → [ws_user_c]                          │ │  │
│  │  └─────────────────────────────────────────────────────┘ │  │
│  └──────────────────────────────────────────────────────────┘  │
│                          │                                       │
│              ┌───────────┴───────────┐                          │
│              ▼                       ▼                          │
│         ┌─────────┐            ┌──────────┐                    │
│         │  Redis  │            │   gRPC   │                    │
│         │ (state) │            │  (LLMs)  │                    │
│         └─────────┘            └──────────┘                    │
└─────────────────────────────────────────────────────────────────┘
        │                              │
        ▼                              ▼
┌──────────────┐              ┌──────────────┐
│   DynamoDB   │              │ Chat Service │
│ (persistent) │              │  (gRPC)      │
└──────────────┘              └──────────────┘
                                     │
                                     ▼
                              ┌──────────────┐
                              │  OpenRouter  │
                              └──────────────┘
```

## Data Flow

### 1. Create Room
```
Client                    Gateway                 DynamoDB
   │                         │                        │
   │──POST /api/rooms───────▶│                        │
   │  {llms: [...]}          │                        │
   │                         │──PutItem──────────────▶│
   │                         │  ROOM#abc123 META      │
   │                         │                        │
   │◀─{room_id: "abc123"}────│                        │
```

### 2. Join Room (WebSocket)
```
Client                    Gateway                 Redis              DynamoDB
   │                         │                      │                    │
   │══WS Connect════════════▶│                      │                    │
   │  /ws/room/abc123        │                      │                    │
   │                         │──GET room:abc123────▶│                    │
   │                         │◀─{participants}──────│                    │
   │                         │                      │                    │
   │                         │──SADD participants──▶│                    │
   │                         │──PUBLISH join───────▶│                    │
   │                         │                      │                    │
   │                         │──Query messages─────────────────────────▶│
   │◀─{history, participants}│                      │                    │
   │                         │                      │                    │
   │  (other clients)        │                      │                    │
   │◀─{user_joined}──────────│◀─SUBSCRIBE──────────│                    │
```

### 3. Send Message
```
Client                    Gateway                 Redis              DynamoDB
   │                         │                      │                    │
   │──{type:"message",...}──▶│                      │                    │
   │                         │──PutItem message────────────────────────▶│
   │                         │──PUBLISH message────▶│                    │
   │                         │                      │                    │
   │  (all room clients)     │                      │                    │
   │◀─{type:"message",...}───│◀─SUBSCRIBE──────────│                    │
```

### 4. @mention LLM
```
Client                    Gateway              Chat Service         OpenRouter
   │                         │                      │                    │
   │──{content:"@claude..."}▶│                      │                    │
   │                         │──parse @mentions─────│                    │
   │                         │                      │                    │
   │                         │──gRPC Chat()────────▶│                    │
   │                         │                      │──stream request───▶│
   │                         │                      │◀─stream chunks─────│
   │                         │◀─stream response─────│                    │
   │                         │                      │                    │
   │  (broadcast to room)    │                      │                    │
   │◀─{type:"llm_chunk",...}─│                      │                    │
   │◀─{type:"llm_chunk",...}─│                      │                    │
   │◀─{type:"llm_done",...}──│                      │                    │
```

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

## REST API

### POST /api/rooms
Create a new room.

Request:
```json
{
  "name": "Architecture Discussion",
  "llms": [
    { "model": "anthropic/claude-sonnet", "persona": "Senior Architect" },
    { "model": "openai/gpt-4", "persona": "Devil's Advocate" }
  ]
}
```

Response:
```json
{
  "room_id": "abc123",
  "join_url": "/room/abc123"
}
```

### GET /api/rooms/{room_id}
Get room info (without joining).

Response:
```json
{
  "id": "abc123",
  "name": "Architecture Discussion",
  "created_at": 1234567890,
  "participant_count": 3,
  "llms": [...]
}
```

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

## Proto Definitions (New)

### room.proto
```protobuf
service Room {
  rpc CreateRoom(CreateRoomRequest) returns (CreateRoomResponse);
  rpc GetRoom(GetRoomRequest) returns (GetRoomResponse);
  rpc JoinRoom(JoinRoomRequest) returns (JoinRoomResponse);
  rpc LeaveRoom(LeaveRoomRequest) returns (LeaveRoomResponse);
}

message LLMConfig {
  string model = 1;
  string persona = 2;
  string display_name = 3;
}

message CreateRoomRequest {
  string name = 1;
  repeated LLMConfig llms = 2;
  string created_by = 3;
}

message CreateRoomResponse {
  string room_id = 1;
}

message Participant {
  string id = 1;
  string name = 2;
  string role = 3;
  string type = 4;  // "human" or "llm"
}

message GetRoomRequest {
  string room_id = 1;
}

message GetRoomResponse {
  string room_id = 1;
  string name = 2;
  uint64 created_at = 3;
  repeated Participant participants = 4;
  repeated LLMConfig llms = 5;
}
```

---

## Implementation Notes

### Connection Manager (Gateway)
- In-memory dict: `room_id → set[WebSocket]`
- On connect: add to room set, subscribe to Redis pub/sub
- On disconnect: remove from set, update Redis, broadcast leave
- On message: validate, persist to DynamoDB, publish to Redis

### @mention Parsing
- Regex: `@(\w+)` to extract mentions
- Match against room's LLM configs
- If LLM mentioned: trigger gRPC Chat() call
- Stream response back through WebSocket to all room members

### Message Threading
- Messages have optional `reply_to` field
- LLM responses always set `reply_to` to the triggering message
- Frontend renders thread link, click to scroll

### Scaling Considerations
- Single EC2 for now (Redis + Gateway on same box)
- If needed: Redis pub/sub enables multiple gateway instances
- DynamoDB scales automatically
