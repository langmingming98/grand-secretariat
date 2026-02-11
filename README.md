# Grand Secretariat (内阁)

A real-time collaborative workspace where humans and AI advisors work together. Named after the consulting cabinet to Ming dynasty emperors.

**[Live Demo](https://grand-secretariat.com)** | **[Technical Design](docs/TECH_DESIGN.md)** | **[Product Spec](docs/PRODUCT_SPEC.md)**

## The Idea

Instead of copy-pasting between ChatGPT, Claude, and Gemini tabs, bring them all into one room. @mention any AI to get their perspective. Watch them respond in real-time with streaming text. Collaborate with humans and AI in the same conversation.

```
Alice (PM): I think we should add OAuth support
Bob (Eng): Agreed, but we need to pick a provider
Alice (PM): @claude give us 3 options with tradeoffs
[Claude responds with streaming text]
Bob (Eng): @gemini poke holes in option 2
[Gemini responds]
```

## Features

- **Room-based collaboration** - Create rooms, invite AI models, share links with teammates
- **@mention dispatch** - AI responds only when mentioned, keeping humans in control
- **Streaming responses** - See AI thinking and typing in real-time
- **Multiple AI models** - Mix Claude, GPT-4, Gemini, Llama, and 100+ models via OpenRouter
- **Typing indicators** - See who's typing (humans) and who's thinking (AI)
- **Polls** - Create polls for group decisions with AI participation

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Next.js Web   │────▶│  FastAPI GW     │────▶│  Room Service   │
│   (React)       │ WS  │  (REST + WS)    │gRPC │  (Python)       │
└─────────────────┘     └─────────────────┘     └────────┬────────┘
                                                         │ gRPC
                                                         ▼
                                                ┌─────────────────┐
                                                │  Chat Service   │
                                                │  (OpenRouter)   │
                                                └─────────────────┘
```

| Layer | Tech | Purpose |
|-------|------|---------|
| Frontend | Next.js 14, React, TailwindCSS | Room UI, streaming chat, @mention autocomplete |
| Gateway | FastAPI, WebSocket | JSON↔Protobuf translation, rate limiting, CORS |
| Room Service | Python, gRPC bidi streaming | Room state, message ordering, @mention dispatch |
| Chat Service | Python, gRPC streaming | LLM provider abstraction, OpenRouter integration |

## Tech Highlights

- **gRPC bidirectional streaming** for real-time room sessions
- **WebSocket ↔ gRPC bridge** with full protocol translation
- **Rate limiting** (slowapi) and **CORS** configuration
- **Async Python** throughout (asyncio, grpc.aio)
- **Protobuf schemas** for type-safe service contracts
- **Modular architecture** ready for horizontal scaling

## Quick Start

### Prerequisites

- Python 3.12+ with [uv](https://docs.astral.sh/uv/)
- Node.js 18+
- [Buf CLI](https://buf.build/docs/cli/installation/) (for proto generation)

### Setup

```bash
# Clone and install dependencies
git clone https://github.com/langmingming98/grand-secretariat.git
cd grand-secretariat
uv sync
cd web && npm install && cd ..

# Set up API key
echo "OPENROUTER_API_KEY=your-key-here" > services/chat/.env
```

### Run Locally

```bash
# Terminal 1: Chat service
cd services/chat && set -a && source .env && set +a && uv run python src/chat/main.py

# Terminal 2: Room service
cd services/room && uv run python src/room/main.py

# Terminal 3: Gateway
cd services/gateway && uv run uvicorn gateway.main:app --reload --port 8000

# Terminal 4: Frontend
cd web && npm run dev
```

Open http://localhost:3000

### Docker

```bash
docker-compose up
```

## Project Structure

```
grand-secretariat/
├── proto/                    # Protobuf definitions
│   └── pb/api/
│       ├── chat/chat.proto   # Chat service contract
│       └── room/room.proto   # Room service contract
├── libs/pb/                  # Generated Python stubs
├── services/
│   ├── chat/                 # LLM provider service
│   ├── room/                 # Room management service
│   └── gateway/              # FastAPI gateway
├── web/                      # Next.js frontend
└── docs/                     # Design documents
```

## API Overview

### REST Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/rooms` | Create a new room |
| GET | `/api/rooms` | List all rooms |
| GET | `/api/rooms/{id}` | Get room details |
| GET | `/api/models` | Search available AI models |

### WebSocket Protocol

Connect to `/ws/room/{room_id}` for real-time room sessions.

**Client → Server:**
```json
{"type": "join", "user_id": "...", "name": "Alice", "role": "member"}
{"type": "message", "content": "Hello @claude", "mentions": ["claude"]}
{"type": "typing", "is_typing": true}
```

**Server → Client:**
```json
{"type": "room_state", "room": {...}, "participants": [...]}
{"type": "message", "sender": {...}, "content": "..."}
{"type": "llm_chunk", "llm_id": "claude", "content": "Here's my"}
{"type": "llm_done", "llm_id": "claude", "message_id": "..."}
```

## Roadmap

- [x] Room-based collaboration with @mentions
- [x] Streaming LLM responses
- [x] Multiple AI model support
- [x] Typing/thinking indicators
- [x] Polls
- [ ] Thread linking ("replying to" UI)
- [ ] DynamoDB persistence
- [ ] Redis pub/sub for scaling
- [ ] Interrupt LLM mid-response
- [ ] Autopilot mode (AI takes turns)

## License

MIT

## Author

Built by [Lang Mingming](https://github.com/langmingming98)
