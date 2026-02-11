# Technical Proposal: LLM Chat Styles

## Problem

When multiple LLMs respond simultaneously, their long-form responses can make it hard to follow the conversation flow. Different LLMs finish paragraphs at different times, and the current UI groups each LLM's response together rather than interleaving.

## Proposed Solution

Add a **Chat Style** setting per LLM that controls response length and format. This solves the problem at the source (prompting) rather than with complex UI interleaving.

---

## Chat Style Options

| Style | Description | System Prompt Modifier | Max Tokens |
|-------|-------------|------------------------|------------|
| `conversational` | Short, punchy. One thought per message. | "Keep responses brief - 1-2 sentences. Think of this as Slack chat, not email." | 150 |
| `detailed` | Full paragraphs, thorough explanations. | "Provide thorough, well-structured responses." | 1000 |
| `bullet` | Structured lists, easy to scan. | "Use bullet points. Be concise and scannable." | 500 |
| `default` | No modification (current behavior). | (none) | (provider default) |

---

## Data Model Changes

### Proto: `room.proto`

```protobuf
message LLMConfig {
  string id = 1;
  string model = 2;
  string persona = 3;
  string display_name = 4;
  string title = 5;
  ChatStyle chat_style = 6;  // NEW
}

enum ChatStyle {
  CHAT_STYLE_UNSPECIFIED = 0;
  CHAT_STYLE_CONVERSATIONAL = 1;
  CHAT_STYLE_DETAILED = 2;
  CHAT_STYLE_BULLET = 3;
}
```

### Store: `MemoryStore`

Add `chat_style` field to stored LLM config. Default to `CHAT_STYLE_UNSPECIFIED` (current behavior).

---

## Backend Changes

### `llm_dispatcher.py`

1. **`build_system_prompt()`**: Append chat style modifier to system prompt based on `llm_config.chat_style`.

2. **`call_llm()`**: Pass `max_tokens` override to Chat Service based on chat style.

### `chat.proto` / Chat Service

Add optional `max_tokens` field to `ChatRequest`:

```protobuf
message ChatRequest {
  repeated Message messages = 1;
  repeated string models = 2;
  repeated ToolDefinition tools = 3;
  optional int32 max_tokens = 4;  // NEW
}
```

---

## Frontend Changes

### Add LLM Form (`ParticipantsSidebar.tsx`, `rooms/page.tsx`)

Add a dropdown/toggle for Chat Style when adding or editing an LLM:

```
[Display Name] [Model Search...]
[Title (optional)]
[Chat Style: Conversational | Detailed | Bullet | Default]
[Persona textarea...]
```

### Edit LLM Form

Same dropdown for editing existing LLMs.

---

## Implementation Order

1. **Proto changes** - Add `ChatStyle` enum and field
2. **Store changes** - Persist chat_style
3. **Dispatcher changes** - System prompt modifiers + max_tokens
4. **Chat Service** - Accept max_tokens parameter
5. **Gateway** - Pass through chat_style in add/update LLM
6. **Frontend** - Add Chat Style selector to forms

---

## Testing

1. Create room with LLMs of different chat styles
2. @mention all - verify conversational LLM responds briefly, detailed LLM responds thoroughly
3. Edit LLM style mid-conversation - next response should reflect new style
4. Verify max_tokens is respected (conversational shouldn't produce walls of text)

---

## Future Enhancements

- **Auto-style**: Detect when multiple LLMs are in room and suggest conversational style
- **Per-message style**: Let user request "brief" or "detailed" in their message
- **Style presets**: Combine with persona presets (e.g., "Concise Expert")
