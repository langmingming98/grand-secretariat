# Grand Secretariat (内阁)

A real-time collaborative workspace where humans and AI advisors work together. Named after the consulting cabinet to Ming dynasty emperors.

## The Problem

You're in a meeting with colleagues. Someone asks a question, so you paste it into ChatGPT. You get a response, copy it back into Slack. Your teammate does the same with Claude. Now you're copy-pasting each other's messages into different AI tabs, losing context, wasting time.

**Grand Secretariat puts everyone in the same room** - multiple humans and multiple AI models, collaborating in real-time. No more copy-paste. No more context loss. Just @mention any AI to get their perspective.

```
Alice (PM): I think we should add OAuth support
Bob (Eng): Agreed, but we need to pick a provider
Alice (PM): @claude give us 3 options with tradeoffs
[Claude responds with streaming text]
Bob (Eng): @gemini poke holes in option 2
[Gemini responds]
Alice (PM): I like option 1. @bob what do you think?
Bob (Eng): Works for me. Let's go with it.
```

## Features

- **Multi-human + multi-AI rooms** - Multiple teammates and multiple AI models in one shared space
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
