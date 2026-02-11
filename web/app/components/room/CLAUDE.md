# Room Components

React components for the room chat interface.

## Component Hierarchy

```
room/[id]/page.tsx (402 lines)
├── JoinDialog          - Modal for entering room (name, title)
├── ParticipantsSidebar - Right sidebar with participants, LLM management (663 lines - LARGE)
│   ├── [inline] AddLLMForm    - Add new LLM (model search, persona, style)
│   ├── [inline] EditLLMForm   - Edit LLM config
│   └── [inline] EditSelfForm  - Edit user name/title
├── MessageRow          - Single chat message
├── StreamingRow        - LLM response in progress
├── PollDisplay         - Poll with voting UI
├── PollCreateModal     - Create poll modal
├── RoomChatInput       - Message input with @mentions, reply preview
└── ReplyPreview        - Shows message being replied to
```

## Shared Types (types.ts)

```typescript
// Re-exported from useRoomSocket
ChatMessage, LLMInfo, Participant

// Local types
StreamingLLM    - In-progress LLM response state
SidebarEntry    - Unified human/LLM entry for sidebar
MentionEntry    - Entry for @mention autocomplete
ChatStyleId     - 0|1|2|3 for response style enum

// Constants
PERSONA_PRESETS - Default persona templates
CHAT_STYLES     - Chat style options (matches proto)
AVATAR_PRESETS  - Emoji avatars for humans/LLMs
```

## Oversized Components (Refactoring Targets)

### ParticipantsSidebar.tsx (663 lines)
Contains three inline forms that should be extracted:
- **AddLLMForm** (lines 293-409): Model picker, persona presets, chat style
- **EditLLMForm** (lines 505-614): Inline LLM editing
- **EditSelfForm** (lines 618-653): User name/title editing

The model picker with debounced search (lines 101-151) is duplicated in `rooms/page.tsx`.

### rooms/page.tsx (609 lines)
The room creation form (model picker, persona, style) should be extracted to `RoomCreateForm.tsx`.

## Key Patterns

### State Management
- `useRoomSocket` hook manages WebSocket connection and room state
- Streaming LLMs tracked in `streamingLLMs` Record by llm_id
- Messages in `messages` array, polls in `polls` Record

### @mention Flow
1. User types `@` in RoomChatInput
2. Autocomplete shows matching participants
3. On send, mentions extracted and included in message
4. Server broadcasts message + triggers LLM responses

### Model Picker Pattern (Duplicated)
```typescript
// Debounced search with useRef timeout
const searchDebounceRef = useRef<NodeJS.Timeout | null>(null)
useEffect(() => {
  if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
  searchDebounceRef.current = setTimeout(async () => {
    // fetch /api/models?q=...
  }, 250)
}, [searchQuery])
```

This pattern appears 3 times and should be extracted to a reusable ModelPicker component.

## Data Flow

### Message Types (from WebSocket)
- `room_state` - Initial state on join
- `message` - Human or completed LLM message
- `llm_thinking` - LLM started processing
- `llm_chunk` - Streaming token
- `llm_done` - LLM finished
- `poll_created`, `poll_voted`, `poll_closed` - Poll events

### LLM Management
- `add_llm` → adds to room, broadcasts `llm_added`
- `update_llm` → updates config, broadcasts `llm_updated`
- `remove_llm` → removes from room, broadcasts `llm_removed`

## Exports (index.ts)

```typescript
export { MessageRow } from './MessageRow'
export { StreamingRow } from './StreamingRow'
export { ParticipantsSidebar } from './ParticipantsSidebar'
export { JoinDialog } from './JoinDialog'
export { RoomChatInput } from './RoomChatInput'
export { PollDisplay } from './PollDisplay'
export { PollCreateModal } from './PollCreateModal'
export { ReplyPreview } from './ReplyPreview'
```
