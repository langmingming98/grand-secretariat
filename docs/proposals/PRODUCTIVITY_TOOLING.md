# Productivity Tooling: Files, Artifacts, and Export

## Overview

Enable users to bring context into rooms (files, images) and extract value out (task lists, documents, summaries). This closes the loop between conversation and action.

## Features

### 1. File & Image Uploads

**User Value:**
- Share context: "Here's the current design" (image)
- Ground discussion: "Review this spec" (PDF/doc)
- Enable multimodal LLMs to analyze visual content

**UX:**
```
┌─────────────────────────────────────────┐
│ [📎] Type a message...        [Send]    │
└─────────────────────────────────────────┘
         │
         ▼ Click or drag-drop
┌─────────────────────────────────────────┐
│ 📎 Attach Files                         │
├─────────────────────────────────────────┤
│ ┌─────┐ ┌─────┐                         │
│ │ 📄  │ │ 🖼️  │  Drop files here        │
│ │spec │ │mock │  or click to browse     │
│ │.pdf │ │.png │                         │
│ └─────┘ └─────┘                         │
│                                         │
│ Supported: Images, PDF, Text, Code      │
│ Max: 10MB per file, 5 files per message │
└─────────────────────────────────────────┘
```

**In Chat:**
```
┌─────────────────────────────────────────┐
│ Alice                           2:34 PM │
├─────────────────────────────────────────┤
│ Here's the current mockup for review:   │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │                                     │ │
│ │        [Thumbnail Preview]          │ │
│ │         mockup-v2.png               │ │
│ │                                     │ │
│ └─────────────────────────────────────┘ │
│ [Download] [Full Screen]                │
└─────────────────────────────────────────┘

Claude                            2:35 PM
├─────────────────────────────────────────┤
│ Looking at the mockup, I notice:        │
│ 1. The CTA button is below the fold     │
│ 2. Color contrast might be accessibility│
│    issue...                             │
```

**Technical:**
- Store in S3 (or local filesystem for dev)
- Generate presigned URLs for download
- Create thumbnails for images
- Extract text from PDFs for LLM context
- Add `attachments` field to Message proto

```protobuf
message Attachment {
  string id = 1;
  string filename = 2;
  string content_type = 3;
  uint64 size_bytes = 4;
  string url = 5;              // presigned download URL
  string thumbnail_url = 6;    // for images
  string extracted_text = 7;   // for PDFs/docs, sent to LLMs
}

message Message {
  // ... existing fields
  repeated Attachment attachments = 10;
}
```

---

### 2. Conversation Export

**User Value:**
- Create actionable artifacts from discussions
- Share outcomes with stakeholders not in the room
- Archive for future reference

**Export Formats:**

#### A. Task List (Markdown Checklist)
```markdown
# Tasks from "Product Planning Session"
Generated: 2024-01-15 3:45 PM

## High Priority
- [ ] Finalize landing page copy (@Alice, due: Jan 20)
- [ ] Review mockup v2 with team (@Bob)
- [ ] Set up A/B test framework (@Claude)

## Medium Priority
- [ ] Research competitor pricing
- [ ] Draft email announcement

## Decisions Made
- Mobile-first approach (voted 3-1)
- Launch date: Feb 1

## Open Questions
- Budget for paid ads?
- Who owns social media launch?
```

#### B. Meeting Notes (Markdown)
```markdown
# Product Planning Session
Date: January 15, 2024
Participants: Alice, Bob, Claude (PM), GPT (Engineer)

## Summary
Discussed landing page design and launch timeline...

## Key Points
1. Decided on mobile-first approach
2. Tech stack: Next.js + Tailwind
3. Launch target: February 1

## Action Items
- Alice: Finalize copy by Jan 20
- Bob: Review mockups
- Claude: Draft implementation plan

## Attachments
- mockup-v2.png
- requirements.pdf
```

#### C. Structured JSON (for integrations)
```json
{
  "session": {
    "id": "room-123",
    "title": "Product Planning Session",
    "date": "2024-01-15T15:45:00Z",
    "participants": ["Alice", "Bob", "Claude", "GPT"]
  },
  "tasks": [
    {
      "title": "Finalize landing page copy",
      "assignee": "Alice",
      "due": "2024-01-20",
      "priority": "high",
      "status": "pending"
    }
  ],
  "decisions": [...],
  "messages": [...] // optional full transcript
}
```

**UX:**
```
Room Menu → Export

┌─────────────────────────────────────────┐
│ Export Conversation                     │
├─────────────────────────────────────────┤
│ Format:                                 │
│  ○ Task List (Markdown)                 │
│  ○ Meeting Notes (Markdown)             │
│  ○ Full Transcript                      │
│  ○ JSON (for integrations)              │
│                                         │
│ Options:                                │
│  ☑ Include attachments                  │
│  ☑ AI-generated summary                 │
│  ☐ Include timestamps                   │
│                                         │
│ [Cancel]                    [Export]    │
└─────────────────────────────────────────┘
```

**Implementation:**
- LLM-powered extraction (use room's manager or dedicated summarizer)
- Structured prompts for task/decision extraction
- Template-based formatting
- Download as file or copy to clipboard

---

### 3. In-Room Artifacts (Live Documents)

**User Value:**
- Collaborative document creation during conversation
- Iterative refinement without leaving the room
- Clear deliverable at end of session

**Concept:**
```
┌─────────────────────────────────────────────────────────────┐
│ Room: Product Planning                    [📄 Artifacts ▼] │
├─────────────────────────────────────────────────────────────┤
│                              │                              │
│   Chat                       │   📄 PRD v2 (Live)           │
│   ─────                      │   ─────────────────          │
│   Alice: Let's refine the    │   # Product Requirements     │
│   requirements section       │                              │
│                              │   ## Overview                │
│   Claude: Updated the PRD    │   Landing page for dev tool  │
│   with your feedback. See    │                              │
│   the Goals section.         │   ## Goals                   │
│                              │   1. Convert visitors ←(new) │
│   [typing...]                │   2. Explain value prop      │
│                              │   3. Collect signups         │
│                              │                              │
│                              │   [Edit] [Export] [History]  │
└─────────────────────────────────────────────────────────────┘
```

**Tool for LLMs:**
```python
{
    "name": "update_artifact",
    "description": "Create or update a shared document/artifact in the room.",
    "parameters": {
        "artifact_id": {"type": "string"},  # omit to create new
        "title": {"type": "string"},
        "content": {"type": "string"},      # full content, replaces existing
        "change_summary": {"type": "string"} # what changed
    }
}
```

---

### 4. Integration Points (Future)

Export to external tools:
- **Notion**: Create page with tasks/notes
- **Linear/Jira**: Create issues from tasks
- **Google Docs**: Export meeting notes
- **GitHub**: Create issues or PRs
- **Slack**: Post summary to channel

These would use OAuth + tool integrations, phase 2+.

---

## Technical Design

### Storage Architecture

```
S3 Bucket: grand-secretariat-uploads
├── rooms/
│   └── {room_id}/
│       ├── attachments/
│       │   └── {message_id}/
│       │       ├── original/
│       │       │   └── filename.png
│       │       └── thumbnails/
│       │           └── filename-thumb.png
│       └── artifacts/
│           └── {artifact_id}/
│               ├── current.md
│               └── history/
│                   ├── v1.md
│                   └── v2.md
```

### Proto Schema

```protobuf
message Attachment {
  string id = 1;
  string filename = 2;
  string content_type = 3;
  uint64 size_bytes = 4;
  string storage_key = 5;     // S3 key
}

message Artifact {
  string id = 1;
  string room_id = 2;
  string title = 3;
  string content = 4;
  string content_type = 5;    // markdown, json, etc.
  string created_by = 6;
  uint64 created_at = 7;
  uint64 updated_at = 8;
  int32 version = 9;
}

message ExportRequest {
  string room_id = 1;
  ExportFormat format = 2;
  bool include_attachments = 3;
  bool ai_summary = 4;
}

enum ExportFormat {
  EXPORT_FORMAT_TASK_LIST = 0;
  EXPORT_FORMAT_MEETING_NOTES = 1;
  EXPORT_FORMAT_TRANSCRIPT = 2;
  EXPORT_FORMAT_JSON = 3;
}
```

### Gateway Endpoints

```python
# Uploads
POST /api/rooms/{room_id}/upload          # Upload file, returns attachment metadata
GET /api/attachments/{attachment_id}      # Download file (presigned redirect)
GET /api/attachments/{attachment_id}/thumb # Thumbnail

# Artifacts
GET /api/rooms/{room_id}/artifacts        # List artifacts
GET /api/artifacts/{artifact_id}          # Get artifact content
PUT /api/artifacts/{artifact_id}          # Update (human edit)
GET /api/artifacts/{artifact_id}/history  # Version history

# Export
POST /api/rooms/{room_id}/export          # Generate export, returns download URL
```

---

## Implementation Plan

### Phase 1: File Uploads (MVP)
1. Add Attachment proto and message field
2. Gateway upload endpoint with local filesystem storage
3. Frontend: Drag-drop zone, file preview, image thumbnails
4. Include attachment text in LLM context

### Phase 2: Basic Export
1. Transcript export (Markdown)
2. LLM-powered task extraction
3. Meeting notes format
4. Download as .md file

### Phase 3: Artifacts
1. Artifact proto and storage
2. `update_artifact` tool for LLMs
3. Artifact viewer panel in room UI
4. Version history

### Phase 4: Cloud Storage & Integrations
1. S3 storage backend
2. Presigned URLs
3. Notion/Linear export (OAuth)

---

## Open Questions

1. **File size limits**: 10MB reasonable? Images can be large
2. **PDF extraction**: Use what library? PyMuPDF? Cloud service?
3. **Artifact conflicts**: What if two LLMs update simultaneously?
4. **Export privacy**: Should exports include full participant info?
5. **Attachment retention**: How long to keep files? User-controlled?

## Success Metrics

- Files uploaded per session
- Export usage rate
- Artifact creation/edit frequency
- Time from session end to external action (Linear issue, etc.)
