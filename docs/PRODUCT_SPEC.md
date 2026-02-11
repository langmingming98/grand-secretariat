# Grand Secretariat - Product Spec

## What's in a Name

**Grand Secretariat (内阁)** was the consulting cabinet to Ming dynasty emperors - a council of senior advisors who deliberated on policy, drafted responses, and provided diverse perspectives to the throne.

This is the experience we want to provide: you are the emperor, and your cabinet of human collaborators and AI advisors is at your service.

## Vision

A collaborative workspace where multiple humans and LLMs work together in real-time. Like a meeting room where AI participants can be called on to contribute.

**Value prop:** Eliminate copy-paste between LLM tabs. Enable real-time human+AI collaboration with natural turn-taking.

**Target users:** Cross-functional teams (PM+Eng, Writer+Editor) who want AI assistance during live collaboration.

---

## Core Interaction Model

### @mentions (Primary Pattern)
Everything is manual by default. Humans chat freely. LLMs respond only when mentioned.

```
Alice (PM): I think we should add OAuth support
Bob (Eng): Agreed, but we need to pick a provider
Alice (PM): @claude give us 3 options with tradeoffs
[Claude responds in a thread referencing Alice's message]
Bob (Eng): @gemini poke holes in option 2
[Gemini responds in a thread]
```

### Autopilot Mode (Explicit Opt-in)
Human triggers autopilot → LLMs take turns responding → continues until human interrupts.
Humans can queue messages while autopilot runs (like Claude Code experience).

---

## Threading Model

Inspired by Apple Messages:
- LLM responses show a visual "replying to X" link to the triggering message
- Click the link to jump to that message in history, click again to jump back
- Main chat remains linear (not nested like Slack threads)
- No branching conversations - just visual context linking

### Referencing Previous Messages
- **@message-id** - Reference a specific message (e.g., "@msg-a1b2 can you expand on this?")
- **Quote selection** - Highlight text → quote it into your message (like ChatGPT)
- Referenced/quoted content is injected into LLM context automatically
- UI shows a preview of the referenced message above your input

```
┌─────────────────────────────────────┐
│ Alice: What auth should we use?     │
│ Bob: Something simple               │
│ Alice: @claude suggest options      │
│ ┌─ Claude (replying to Alice) ────┐ │
│ │ Here are 3 options...           │ │
│ └─────────────────────────────────┘ │
│ Bob: I like option 2                │
│ Bob: @gemini what's wrong with it?  │
│ ┌─ Gemini (replying to Bob) ──────┐ │
│ │ Option 2 has these issues...    │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

---

## User Roles

| Role | Description |
|------|-------------|
| **Initiator** | Creates room, configures LLMs and their personas |
| **Participant** | Joins via URL, sets their own display name + role |
| **LLM** | Configured by initiator with name + persona (e.g., "Claude - Devil's Advocate") |

---

## User Stories (Prioritized)

### P0 - Core Experience
- [ ] Create a room with selected LLMs and their personas
- [ ] Join room anonymously via URL, set display name + role
- [ ] See all participants (humans + LLMs) and their roles
- [ ] Send messages, see messages in real-time
- [ ] @mention an LLM to trigger response
- [ ] See LLM responses threaded to the triggering message
- [ ] See typing indicators (humans) and thinking indicators (LLMs)

### P1 - Session Management
- [ ] Retrieve chat history by revisiting room URL
- [ ] See who's currently in the room (presence)
- [ ] End/archive a session (initiator only)
- [ ] Reconnect seamlessly after connection drop

### P2 - Autopilot & Control
- [ ] Interrupt LLM mid-response
- [ ] Toggle autopilot: LLMs take turns until interrupted
- [ ] Queue messages while autopilot is running
- [ ] Set iteration limit (max rounds before pause)
- [ ] Select orchestration mode (see below)

#### Autopilot Orchestration Modes

| Mode | How it works | Good for |
|------|--------------|----------|
| **Round Robin** | LLMs respond in fixed order, each gets one turn per round | Fair exploration, brainstorming |
| **Leader-Follower** | Leader proposes, followers critique/refine, leader summarizes | Decision-making, refinement |
| **Debate** | Two LLMs argue opposing sides, third judges | Stress-testing ideas |
| **Relay** | Each LLM builds on previous response (chain-of-thought across models) | Deep analysis, iterative refinement |
| **Consensus** | All respond in parallel, then vote/synthesize agreement | Quick convergence |

### P3 - Wishlist
- [ ] Voice-to-text input
- [ ] Mute/unmute specific LLMs
- [ ] Kick participants
- [ ] Structured turn modes (round-robin, moderated)

---

## Technical Requirements

### Must Demonstrate
| Tech | Purpose | Why it matters for resume |
|------|---------|---------------------------|
| gRPC bidirectional streaming | Real-time LLM responses through WebSocket | Systems engineering depth |
| Turn orchestration | @mention parsing, response queuing, interrupts | Core technical challenge |
| Multi-model orchestration | Parallel/sequential LLM calls, provider abstraction | LLM engineering |
| Context management | Compression as conversation grows | Practical LLM problem |
| State synchronization | Multiple clients seeing consistent state | Distributed systems |
| Message ordering | Deterministic order across N humans + M LLMs | Non-trivial with concurrency |

### Infrastructure (AWS, cost-conscious)
| Component | Options | Notes |
|-----------|---------|-------|
| Persistence | DynamoDB (free tier) or RDS Postgres (t3.micro free tier) | DynamoDB simpler for chat logs |
| Real-time state | ElastiCache Redis or in-memory on single EC2 | Start simple, Redis if scaling |
| Compute | Existing EC2 | Already have this |
| WebSocket | API Gateway WebSocket or direct on EC2 | Direct is simpler to start |

### System Edge Cases
- [ ] Two humans type simultaneously → order by server receipt time
- [ ] Message sent while LLM responding → queue, don't interrupt unless explicit
- [ ] Connection drops → resync state on reconnect, no lost messages
- [ ] Long LLM response → stream chunks, allow interrupt
- [ ] LLM provider fails → surface error in chat, don't break room
- [ ] Rate limits → per-user, per-room, per-LLM limits with clear feedback

---

## Out of Scope (For Now)
- User accounts / authentication (anonymous-first)
- Payment / usage billing
- Mobile app (responsive web only)
- Self-hosting / on-prem
- Fine-tuning or custom models

---

## Success Metrics (Evaluation)

| Metric | What it measures |
|--------|------------------|
| Time-to-decision | How fast can a group reach consensus vs separate LLM tabs |
| Context switches | Elimination of copy-paste between tools |
| Collaboration feel | Qualitative: "felt like a team" vs "felt like a tool" |
| Technical latency | Time from @mention to first LLM token |
| Reconnection resilience | % of dropped connections that recover cleanly |
