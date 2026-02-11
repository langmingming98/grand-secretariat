# Voting/Polling Feature

## Overview

Enable structured decision-making in rooms through polls that both humans and LLMs can create and vote on. Exposed as a tool to LLMs so they can proactively facilitate group decisions.

## User Value

- **Structured outcomes**: Instead of 3 paragraphs of opinions, get a clear vote count
- **LLM coordination**: LLMs can create polls to break deadlocks or gather input
- **Decision history**: Polls persist as room artifacts, documenting why decisions were made
- **Reduces noise**: Voting is a single action vs. writing paragraphs of agreement

## UX Design

### Creating a Poll (Human)
```
[Create Poll] button in room header or slash command /poll

┌─────────────────────────────────────────┐
│ Create Poll                             │
├─────────────────────────────────────────┤
│ Question: What framework for the API?   │
│                                         │
│ Options:                                │
│  ○ FastAPI (add description optional)   │
│  ○ Flask                                │
│  ○ Django REST                          │
│  [+ Add option]                         │
│                                         │
│ Settings:                               │
│  ☑ Allow multiple votes                 │
│  ☐ Anonymous voting                     │
│  ☐ LLMs can vote                        │
│                                         │
│ [Cancel]                    [Create]    │
└─────────────────────────────────────────┘
```

### Poll Display in Chat
```
┌─────────────────────────────────────────┐
│ 📊 Poll: What framework for the API?    │
├─────────────────────────────────────────┤
│ ▓▓▓▓▓▓▓▓▓▓░░░░░ FastAPI (3 votes)       │
│   "Fast, async-native" - Claude         │
│   "Good docs" - Alice                   │
│                                         │
│ ▓▓▓▓░░░░░░░░░░░ Flask (1 vote)          │
│   "Simpler" - GPT                       │
│                                         │
│ ░░░░░░░░░░░░░░░ Django REST (0 votes)   │
│                                         │
│ [Vote] [Close Poll]    4 votes · Open   │
└─────────────────────────────────────────┘
```

### LLM-Created Poll
LLMs create polls via tool call. Appears in chat as a message from that LLM with the poll embedded.

```
Claude: I think we should decide on the approach before diving into implementation. Let me create a poll:

📊 Poll: How should we handle authentication?
○ JWT tokens (stateless, scalable)
○ Session cookies (simpler, traditional)
○ OAuth only (delegate to providers)

[Vote]
```

## Technical Design

### Proto Schema

```protobuf
// In room.proto

message Poll {
  string id = 1;
  string room_id = 2;
  string creator_id = 3;  // user_id or llm_id
  string question = 4;
  repeated PollOption options = 5;
  bool allow_multiple = 6;
  bool anonymous = 7;
  bool llms_can_vote = 8;
  bool closed = 9;
  uint64 created_at = 10;
  uint64 closed_at = 11;
}

message PollOption {
  string id = 1;
  string text = 2;
  string description = 3;  // optional
  repeated PollVote votes = 4;
}

message PollVote {
  string voter_id = 1;
  string voter_name = 2;
  string reason = 3;  // optional, LLMs often provide reasoning
  uint64 voted_at = 4;
}

// Events
message PollCreatedEvent {
  Poll poll = 1;
}

message PollVoteEvent {
  string poll_id = 1;
  string option_id = 2;
  PollVote vote = 3;
}

message PollClosedEvent {
  string poll_id = 1;
  string closed_by = 2;
}
```

### LLM Tool Definition

```python
{
    "name": "create_poll",
    "description": "Create a poll to gather votes from room participants. Use this when the group needs to make a decision or you want to understand preferences.",
    "parameters": {
        "type": "object",
        "properties": {
            "question": {
                "type": "string",
                "description": "The question to ask"
            },
            "options": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "text": {"type": "string"},
                        "description": {"type": "string"}
                    }
                },
                "minItems": 2,
                "maxItems": 6
            },
            "allow_multiple": {
                "type": "boolean",
                "default": False
            }
        },
        "required": ["question", "options"]
    }
}

{
    "name": "vote_on_poll",
    "description": "Cast your vote on an active poll. You can optionally provide reasoning.",
    "parameters": {
        "type": "object",
        "properties": {
            "poll_id": {"type": "string"},
            "option_ids": {
                "type": "array",
                "items": {"type": "string"}
            },
            "reason": {
                "type": "string",
                "description": "Brief explanation for your vote"
            }
        },
        "required": ["poll_id", "option_ids"]
    }
}

{
    "name": "get_poll_results",
    "description": "Get current results of a poll to inform your response.",
    "parameters": {
        "type": "object",
        "properties": {
            "poll_id": {"type": "string"}
        },
        "required": ["poll_id"]
    }
}
```

### Storage

```python
# In-memory store extension
class MemoryStore:
    def __init__(self):
        self._polls: dict[str, Poll] = {}  # poll_id -> Poll
        self._room_polls: dict[str, list[str]] = {}  # room_id -> [poll_ids]

    async def create_poll(self, poll: Poll) -> Poll: ...
    async def get_poll(self, poll_id: str) -> Poll | None: ...
    async def list_room_polls(self, room_id: str, active_only: bool = True) -> list[Poll]: ...
    async def add_vote(self, poll_id: str, option_id: str, vote: PollVote) -> Poll: ...
    async def close_poll(self, poll_id: str, closed_by: str) -> Poll: ...
```

### Gateway Endpoints

```python
# REST
POST /api/rooms/{room_id}/polls  # Create poll
GET /api/rooms/{room_id}/polls   # List polls
POST /api/polls/{poll_id}/vote   # Cast vote
POST /api/polls/{poll_id}/close  # Close poll

# WebSocket events (room session)
# Outbound: poll_created, poll_vote, poll_closed
# Inbound: create_poll, vote, close_poll
```

## Implementation Plan

### Phase 1: Human Polls (MVP)
1. Add Poll proto messages
2. Extend store with poll methods
3. Add gateway endpoints
4. Frontend: Poll creation modal, poll display component, vote button
5. WebSocket events for real-time updates

### Phase 2: LLM Tool Integration
1. Add poll tools to `_build_room_tools()` in llm_dispatcher.py
2. Handle tool calls in session.py
3. Include active polls in LLM context (system prompt or tool result)

### Phase 3: Polish
1. Poll analytics (participation rate, consensus score)
2. Poll templates ("Quick vote: Yes/No/Abstain")
3. Deadline/auto-close
4. Results visualization

## Open Questions

1. **Should closed polls be editable?** Probably not - they're decision records
2. **Can creators vote on their own polls?** Yes, but maybe show it differently
3. **How to handle LLM abstention?** They can choose not to vote, or we add explicit abstain option
4. **Poll visibility in history?** Polls should appear inline in chat history, collapsed if closed

## Success Metrics

- Polls created per room
- Vote participation rate (votes / eligible voters)
- Time to close (faster = more decisive)
- LLM poll creation rate (are they using the tool?)
