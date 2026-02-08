# Agentic Group Mode

## Overview

Enable LLM groups to work autonomously on complex tasks with minimal human intervention. LLMs take on specialized roles (PM, Engineer, Tester, etc.) and orchestrate themselves through @mentions until a deliverable is complete or human input is needed.

## User Value

- **Parallel problem solving**: Multiple specialists work simultaneously
- **Reduced human burden**: Set the goal, let the group execute
- **Visible reasoning**: Watch the team debate, course-correct if needed
- **Persistent context**: Unlike subagents, specialists remember the full conversation
- **Accountability**: Each role has clear responsibilities and deliverables

## Core Concept: The Orchestration Loop

```
Human: "Design a landing page for our new product"

┌─────────────────────────────────────────────────────────────┐
│                    AGENTIC GROUP MODE                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Manager (TPM):                                             │
│  "Breaking this down: @PM define requirements,              │
│   @Designer create mockups, @Engineer review feasibility"  │
│                                                             │
│  PM:                                                        │
│  "Key sections needed: hero, features, pricing, CTA.        │
│   Target audience is developers. @Designer here's the brief"│
│                                                             │
│  Designer:                                                  │
│  "Here's the mockup: [image]. Modern, minimal, dev-focused. │
│   @Engineer can we do the animated code demo in the hero?"  │
│                                                             │
│  Engineer:                                                  │
│  "Yes, using Prism.js + CSS animations. Estimated 2 days.   │
│   @Manager implementation plan ready."                      │
│                                                             │
│  Manager:                                                   │
│  "✅ Requirements defined                                    │
│   ✅ Mockup created                                         │
│   ✅ Feasibility confirmed                                  │
│   @Human: Ready for review. Approve to proceed?"            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Design Principles

### 1. Manager Role is Key
One LLM acts as the orchestrator:
- Breaks down tasks into subtasks
- Assigns work via @mentions
- Tracks progress toward goal
- Decides when to escalate to human
- Synthesizes outputs into deliverables

### 2. Explicit Handoffs
LLMs must @mention to hand off. No implicit "everyone responds":
- `@Engineer please review` → Engineer responds
- `@all thoughts?` → Everyone responds
- `@Human need decision` → Pause and wait for human

### 3. Goal-Oriented Termination
The loop continues until:
- Manager declares goal complete
- Manager requests human input
- Human interrupts
- Token/turn limit reached
- Error/stuck detection

### 4. Human Observability
Humans can:
- Watch in real-time (streaming)
- Pause/resume the group
- Inject guidance mid-flow
- Override any decision

## Technical Design

### Room Mode: Manual vs Agentic

```protobuf
message Room {
  // ... existing fields
  RoomMode mode = 10;
  AgenticConfig agentic_config = 11;
}

enum RoomMode {
  ROOM_MODE_MANUAL = 0;      // Current behavior: human triggers LLMs
  ROOM_MODE_AGENTIC = 1;     // LLMs can @mention each other autonomously
}

message AgenticConfig {
  string manager_llm_id = 1;          // Which LLM orchestrates
  string goal = 2;                     // What we're trying to achieve
  int32 max_turns = 3;                 // Safety limit (default: 50)
  int32 turn_count = 4;                // Current turn
  bool paused = 5;                     // Human paused the group
  repeated string human_checkpoints = 6;  // Goals that require human approval
}
```

### LLM Roles (Persona Enhancement)

Extend LLM config to include role type:

```python
class LLMRole(str, Enum):
    MANAGER = "manager"      # Orchestrates, tracks progress
    SPECIALIST = "specialist"  # Domain expert (PM, Engineer, etc.)
    CRITIC = "critic"        # Reviews, challenges, QA
    SYNTHESIZER = "synthesizer"  # Summarizes, creates deliverables

# In room LLM config
{
    "id": "claude-pm",
    "model": "anthropic/claude-sonnet-4",
    "display_name": "PM",
    "role": "specialist",
    "persona": "You are a product manager. Focus on user needs, requirements, and priorities..."
}
```

### Manager System Prompt

```python
MANAGER_PROMPT = """
You are the Manager/TPM for this group. Your responsibilities:

1. BREAK DOWN the goal into concrete subtasks
2. ASSIGN work to specialists via @mentions
3. TRACK progress and blockers
4. SYNTHESIZE outputs into deliverables
5. ESCALATE to @Human when:
   - A decision requires human judgment
   - The group is stuck or disagrees
   - A milestone is ready for review
   - The goal is complete

Current goal: {goal}
Progress: {progress_summary}
Turn {current_turn} of {max_turns}

When the goal is complete, say "GOAL COMPLETE" and summarize deliverables.
When you need human input, say "@Human" and explain what you need.
"""
```

### Agentic Loop Implementation

```python
# In session.py or new agentic_loop.py

class AgenticLoop:
    def __init__(self, room: Room, config: AgenticConfig):
        self.room = room
        self.config = config
        self.turn_count = 0

    async def start(self, initial_message: str):
        """Human provides the goal, manager takes over."""
        # Manager gets first turn
        await self._trigger_llm(self.config.manager_llm_id, initial_message)

    async def on_llm_response(self, llm_id: str, content: str, tool_calls: list):
        """Called when an LLM finishes responding."""
        self.turn_count += 1

        # Check termination conditions
        if self.turn_count >= self.config.max_turns:
            await self._broadcast_system("Turn limit reached. @Human please review progress.")
            return

        if "GOAL COMPLETE" in content:
            await self._broadcast_system("Goal marked complete by manager.")
            self.config.paused = True
            return

        if self.config.paused:
            return

        # Extract @mentions and trigger next LLMs
        mentions = self._extract_mentions(content)
        if "@human" in [m.lower() for m in mentions]:
            # Pause and wait for human
            self.config.paused = True
            return

        for mention in mentions:
            llm = self._find_llm_by_name(mention)
            if llm:
                await self._trigger_llm(llm.id, content)

    async def resume(self, human_message: str):
        """Human provides input, loop continues."""
        self.config.paused = False
        # Manager processes human input
        await self._trigger_llm(self.config.manager_llm_id, human_message)
```

### Progress Tracking

LLMs need awareness of what's been done:

```python
def _build_progress_summary(self) -> str:
    """Build a summary of completed subtasks for LLM context."""
    # Option 1: Manager maintains a checklist via tool
    # Option 2: Extract from conversation (more fragile)
    # Option 3: Structured progress events

    return """
    Completed:
    ✅ Requirements gathered (PM, turn 3)
    ✅ Tech stack decided (Engineer, turn 5)

    In Progress:
    🔄 Mockup creation (Designer, turn 7)

    Pending:
    ⬜ Implementation plan
    ⬜ Human review
    """
```

### New Tools for Agentic Mode

```python
{
    "name": "update_progress",
    "description": "Mark a subtask as complete or update its status. Only the Manager should use this.",
    "parameters": {
        "subtask": {"type": "string"},
        "status": {"type": "string", "enum": ["pending", "in_progress", "complete", "blocked"]},
        "notes": {"type": "string"}
    }
}

{
    "name": "create_deliverable",
    "description": "Create a named output artifact (document, spec, plan, etc.) that persists beyond the conversation.",
    "parameters": {
        "name": {"type": "string"},
        "type": {"type": "string", "enum": ["document", "spec", "plan", "code", "checklist"]},
        "content": {"type": "string"}
    }
}

{
    "name": "request_human_decision",
    "description": "Pause the agentic loop and request human input on a specific decision.",
    "parameters": {
        "question": {"type": "string"},
        "options": {"type": "array", "items": {"type": "string"}},
        "context": {"type": "string"}
    }
}
```

## UX Design

### Entering Agentic Mode

```
┌─────────────────────────────────────────┐
│ Start Agentic Session                   │
├─────────────────────────────────────────┤
│ Goal:                                   │
│ ┌─────────────────────────────────────┐ │
│ │ Design and plan a landing page for  │ │
│ │ our developer tool product          │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ Manager: [Claude (TPM) ▼]               │
│                                         │
│ Team:                                   │
│  ☑ Claude (PM)                          │
│  ☑ GPT (Engineer)                       │
│  ☑ Gemini (Designer)                    │
│  ☐ Claude (QA)                          │
│                                         │
│ Settings:                               │
│  Max turns: [50]                        │
│  ☑ Require approval at milestones       │
│                                         │
│ [Cancel]                    [Start]     │
└─────────────────────────────────────────┘
```

### Agentic Mode UI

```
┌─────────────────────────────────────────────────────────────┐
│ 🤖 AGENTIC MODE: Design landing page          [⏸ Pause]     │
│ Turn 7/50 · 3 tasks complete · Manager: Claude (TPM)        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ [Chat messages stream here with role badges]                │
│                                                             │
│ TPM: Breaking this into phases...                           │
│ PM: Here are the requirements...                            │
│ Designer: Working on mockups...                             │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ Progress                                    [Deliverables]  │
│ ✅ Requirements defined                      📄 PRD v1      │
│ ✅ Tech stack chosen                         📄 Tech Spec   │
│ 🔄 Mockup in progress                                       │
│ ⬜ Implementation plan                                       │
│ ⬜ Human review                                              │
└─────────────────────────────────────────────────────────────┘
```

### Human Intervention

When paused for human input:
```
┌─────────────────────────────────────────┐
│ 🙋 Human Input Needed                   │
├─────────────────────────────────────────┤
│ TPM is asking:                          │
│ "Should we prioritize mobile-first or   │
│  desktop-first for the landing page?"   │
│                                         │
│ Options suggested:                      │
│  ○ Mobile-first (recommended by PM)     │
│  ○ Desktop-first (simpler, faster)      │
│  ○ Responsive from start                │
│                                         │
│ Or type your own response:              │
│ ┌─────────────────────────────────────┐ │
│ │                                     │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ [Resume with Selection]                 │
└─────────────────────────────────────────┘
```

## Implementation Plan

### Phase 1: Foundation
1. Add `RoomMode` and `AgenticConfig` to proto
2. Implement `AgenticLoop` class in session.py
3. Manager system prompt with goal tracking
4. Basic turn limit and pause/resume

### Phase 2: Progress Tracking
1. `update_progress` tool for manager
2. Progress sidebar UI
3. Automatic progress extraction as fallback

### Phase 3: Deliverables
1. `create_deliverable` tool
2. Deliverable storage (in-memory, then S3)
3. Deliverable viewer/editor UI
4. Export deliverables

### Phase 4: Polish
1. Stuck detection (same @mentions cycling)
2. Cost tracking and limits
3. Session replay
4. Templates for common workflows (product planning, code review, etc.)

## Comparison: Grand Secretariat vs Claude Code Subagents

| Aspect | Claude Code Subagents | Grand Secretariat Agentic |
|--------|----------------------|---------------------------|
| Context | Fresh per subagent | Persistent, shared history |
| Visibility | Hidden until complete | Real-time streaming |
| Intervention | None (fire and forget) | Pause, guide, override |
| Roles | Generic task workers | Named specialists with personas |
| Collaboration | Sequential handoff | Parallel, multi-party |
| Deliverables | Code/files only | Docs, specs, plans, artifacts |

## Open Questions

1. **Cost management**: How to limit token spend? Per-turn budgets? Total session budget?
2. **Stuck detection**: How to detect when the group is spinning? Repeated patterns? Manager self-awareness?
3. **Forking**: Can humans branch the session to try different approaches?
4. **Context compression**: Long sessions will hit limits. Summarize older turns?
5. **Role flexibility**: Can a specialist become temporary manager for subtasks?

## Success Metrics

- Sessions reaching "GOAL COMPLETE" vs abandoned
- Human interventions per session (fewer = better autonomy)
- Turn efficiency (goal complexity / turns used)
- Deliverable quality (user ratings)
- User return rate for agentic mode
