# Test Feedback Queue

Use this file during testing to capture issues, regressions, and polish items before batching fixes.

## Triage Buckets

- `P0` blocker: breaks core chat flow
- `P1` high: major UX/function issue, workaround exists
- `P2` medium: quality/polish issue
- `P3` low: nice-to-have

## Active Queue

| ID | Priority | Area | Repro Steps | Expected | Actual | Status | Notes |
|---|---|---|---|---|---|---|---|
| TQ-011 | `P2` | LLM opt-out UI | LLM uses opt_out tool to decline responding | Streaming bubble should disappear cleanly | Empty bubble remains visible with "replying to" | `fixed_pending_verification` | StreamingRow returns null when no content and not thinking |
| TQ-012 | `P2` | Message style | View chat messages | Slack-style: no bubbles, continuous flow, avatar + name on left | Current: chat bubbles like iMessage/WhatsApp | `fixed_pending_verification` | Renamed to MessageRow/StreamingRow, removed bubbles, added avatars |
| TQ-013 | `P1` | LLM-to-LLM chained mentions | LLM A mentions LLM B, B's reply mentions LLM C | C should also be triggered to respond | Only first-level mention works, chained mentions don't trigger | `fixed_pending_verification` | Added text-based @mention fallback parsing in session.py |
| TQ-014 | `P2` | Self-editing UX | Edit own name/title in room | Should edit from participant list (like LLMs), not header | Currently: name/title editing in top-right header, duplicated in sidebar | `fixed_pending_verification` | Moved self-editing to sidebar, removed from header |
| TQ-015 | `P2` | Add LLM model picker | Click "+" to add LLM in sidebar | Searchable text field with autocomplete | Dropdown list too long, hard to navigate | `fixed_pending_verification` | Replaced dropdown with searchable list, shows selected model as chip |
| TQ-016 | `P2` | Persona field UX | Add/edit LLM persona in sidebar | Larger textarea, comfortable for multi-paragraph prompts | Small expandable box, feels cramped for long text | `fixed_pending_verification` | Increased textarea to 4 rows with min-height 80px |
| TQ-017 | `P3` | Room list description | View /rooms page | Room description visible in room card for easy lookup | Only room name and LLM badges shown | `fixed_pending_verification` | Added description snippet to room cards |
| TQ-018 | `P2` | LLM response display mode | Watch LLM respond in chat | Option for Slack-style: typing indicator → paragraph messages (vs current chunk streaming) | Single streaming bubble with all content | `fixed_pending_verification` | Toggle in header: Stream (live chunks) vs Slack (complete paragraphs only) |
| TQ-019 | `P3` | Room description in chat view | Enter a room with description | Description visible in header or above participants sidebar | Description only set at creation, not shown in room | `fixed_pending_verification` | Added description to chat header below room name |
| TQ-020 | `P3` | Default room description | Create new room | Pre-populated default description for easier testing | Description field is empty | `fixed_pending_verification` | Default description now pre-populated |
| TQ-021 | `P2` | Room presets | Create new room | Preset templates for quick room creation (e.g., "Fintech Brainstorm") | No presets, manual entry only | `fixed_pending_verification` | Added 4 presets: Fintech Brainstorm, Blank Room, AI Debate, Writing Room |
| TQ-022 | `P2` | Persona presets | Add LLM with persona | Preset persona templates (current default should be a selectable preset) | Default persona is hardcoded, no presets | `fixed_pending_verification` | Added 5 presets: Default, Expert, Creative, Critic, Brief (in both rooms page and chat sidebar) |
| TQ-023 | `P3` | Page title | View browser tab | Appropriate app name | "Claude Took Over Human" | `fixed_pending_verification` | Renamed to "Grand Secretariat" |
| TQ-024 | `P2` | UI style toggle | In chat room | Choose between Slack-style and bubble-style messaging | Only Slack-style available | `wont_fix` | Consolidated with TQ-018; bubble style deprioritized in favor of Stream vs Slack mode |
| TQ-025 | `P2` | Multi-LLM mention in single message | User mentions multiple LLMs: "@ChatGPT refine this, @Claude code this" | Each LLM should understand which part is addressed to them | LLMs may not distinguish their specific task | `fixed_pending_verification` | System prompt now explains multi-mention handling with examples |
| TQ-026 | `P2` | LLM Chat Styles | Add LLM to room | Option to set chat style (conversational/detailed/bullet) | Only persona controls response style | `fixed_pending_verification` | Added ChatStyle enum to proto, system prompt modifiers, frontend selector |
| TQ-027 | `P1` | Auto-scroll | Reading previous messages while new ones arrive | Stay at current scroll position | Dragged to bottom on each new message | `fixed_pending_verification` | Track if near bottom (150px threshold), only auto-scroll when near bottom |
| TQ-028 | `P2` | Reply attribution | LLM responds to a message | "Replying to [specific message]" or no attribution | Sometimes says "replying to message" without pointing to specific one | `fixed_pending_verification` | ReplyPreview now returns null if message not found instead of generic text |
| TQ-029 | `P3` | Participant colors | View participant avatars | Different colors for easy differentiation | All same style | `fixed_pending_verification` | Added getAvatarColor() hash function with 10-color palette |
| TQ-030 | `P3` | Load room icon | View room loading state | Icon instead of text hint | Text hint shown | `fixed_pending_verification` | Added loading spinner for room loading, chat bubble icon for empty state |
| TQ-031 | `P1` | Stable participant IDs | Rename participant mid-session | Identify by stable ID, not name/model/title | Identity tied to mutable fields | `fixed_pending_verification` | Backend already uses user_id as stable ID; frontend uses id consistently |
| TQ-032 | `P2` | Persist participants | Rejoin room after leaving | See all participants (not just online) | Only online participants shown | `fixed_pending_verification` | Added is_online field to Participant proto, show all participants with online/offline status |
| TQ-033 | `P2` | Edit LLM name in session | Click on LLM name in chat | Editable inline | Must go to sidebar | `fixed_pending_verification` | LLM name in MessageRow is now clickable, shows inline input on click |
| TQ-034 | `P2` | Remove participant | Want to kick model/user from room | Remove button in participant list | No way to remove | `fixed_pending_verification` | Added RemoveLLM proto, backend handler, gateway, frontend X button with confirmation |
| TQ-035 | `P2` | Filter tool-incapable models | Add LLM that needs tool use | Models without tool support hidden from list | All models shown, some can't participate properly | `fixed_pending_verification` | Gateway /api/models now filters by supported_features.tool_use by default |
| TQ-036 | `P2` | Persona selection UI | Create new room | Better persona configuration experience | Current flow unclear | `queued` | Phase 3 - needs discussion |
| TQ-037 | `P3` | AI-assisted room setup | Create new room | One-click setup, AI picks roles/models based on intent | Manual configuration required | `fixed_pending_verification` | Added POST /api/rooms/generate-config endpoint (uses Haiku), AI generation UI in RoomCreateForm |
| TQ-038 | `P3` | Setup interview questions | Create new room | Simple multiple-choice to configure scenario | Free-form input only | `queued` | Phase 3 |
| TQ-039 | `P3` | Generate presets from context | Configure model settings | Auto-generate based on room context | Must type settings one by one | `queued` | Phase 3 |
| TQ-040 | `P2` | Room locking | Control room access | Lock rooms based on user preference | All rooms open to everyone | `fixed_pending_verification` | Added visibility field to proto/store/gateway/frontend. Private rooms hidden from list but accessible via direct link. |
| TQ-041 | `P2` | Real-time vote sync | Participate in vote | See results before/during voting (configurable) | Must vote before seeing results | `fixed_pending_verification` | Vote counts and bars now show in real-time as votes come in |
| TQ-042 | `P3` | Participant hover tooltips | Hover over avatar/name in chat | See participant details without opening sidebar | Must click to sidebar | `fixed_pending_verification` | Avatar shows tooltip with name, model (LLM), title, online status |
| TQ-043 | `P3` | Preset avatars | Customize participant appearance | Preset images to choose from | No avatar customization | `fixed_pending_verification` | Added avatar field to proto, backend, gateway, frontend; emoji presets in types.ts; MessageRow shows emoji avatars |
| TQ-044 | `P3` | Emoji shorthand | Type emoji codes in chat | `:smile:` → 😊 | No shorthand support | `fixed_pending_verification` | Added convertEmojiShortcodes() with 70+ common emoji codes |
| TQ-045 | `P3` | Small model router | Send message to room with many LLMs | Small model decides which LLMs to wake | Full context sent to all | `queued` | Phase 5 - scalability |
| TQ-046 | `P1` | Model roleplay bug | LLM responds in conversation | Respond as itself | Sometimes roleplays as human participant | `fixed_pending_verification` | Added "CRITICAL" instruction to system prompt forbidding roleplay as other participants |
| TQ-047 | `P2` | Poll vote reason optional | LLM votes on poll | Reason should be optional, only provide if responding to additional context | LLMs always provide verbose reasons | `fixed_pending_verification` | Updated tool descriptions and poll instruction to emphasize reason is optional |
| TQ-048 | `P1` | Auto-scroll regression | Scroll up while messages arrive | Stay at scroll position | Still dragged to bottom | `fixed_pending_verification` | Added isAutoScrollingRef flag to ignore scroll events during programmatic scroll |
| TQ-049 | `P1` | WebSocket reconnection | Connection drops mid-session | Auto-reconnect with state preservation | Connection lost, must refresh | `fixed_pending_verification` | Auto-reconnect with exponential backoff (1s-30s), max 10 attempts, reconnecting banner UI |
| TQ-050 | `P2` | Load older history | Scroll up in chat | Load older messages with pagination | Only recent messages visible | `fixed_pending_verification` | Added GET /api/rooms/{id}/history endpoint, scroll-up triggers load, scroll position preserved |

## Status Values

- `queued`
- `confirmed`
- `in_progress`
- `fixed_pending_verification`
- `verified`
- `wont_fix`

---

## Resolved Issues (Archived)

| ID | Priority | Area | Resolution |
|---|---|---|---|
| TQ-001 | `P1` | Message rendering | Server + client-side sender-prefix stripping |
| TQ-002 | `P0` | Mentions (`@all`) | Backend regex + mention normalization |
| TQ-003 | `P1` | Add participant/LLM UX | Model search + select dropdown |
| TQ-004 | `P1` | Mention response formatting | Repeated self-name prefix stripping |
| TQ-005 | `P0` | Participant edit/save | Title editing + join payload persistence |
| TQ-006 | `P2` | UI theme | Light-first styling |
| TQ-007 | `P2` | Message header labeling | Display name preferred, model as fallback |
| TQ-008 | `P1` | Rooms page CTA contrast | Added `text-white` to buttons |
| TQ-009 | `P0` | Room creation model search | Backend services restored |
| TQ-010 | `P1` | Mention autocomplete | mentionText uses display_name |
