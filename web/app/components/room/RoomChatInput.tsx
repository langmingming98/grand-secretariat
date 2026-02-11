'use client'

import { useState, useRef, useMemo, memo } from 'react'
import { parseMentions } from '../../lib/utils'
import type { ChatMessage, LLMInfo, Participant, MentionEntry } from './types'

interface RoomChatInputProps {
  onSend: (content: string, mentions: string[], replyTo?: string) => void
  onTyping: (isTyping: boolean) => void
  llms: LLMInfo[]
  participants: Participant[]
  userId: string
  disabled: boolean
  replyTo: string | null
  replyToMessage: ChatMessage | undefined
  onCancelReply: () => void
}

function RoomChatInputInner({
  onSend,
  onTyping,
  llms,
  participants,
  userId,
  disabled,
  replyTo,
  replyToMessage,
  onCancelReply,
}: RoomChatInputProps) {
  const [message, setMessage] = useState('')
  const [showMentions, setShowMentions] = useState(false)
  const [mentionFilter, setMentionFilter] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSend = () => {
    if (!message.trim() || disabled) return

    // Extract @mentions
    // Support Unicode (Chinese, etc.) in mentions
    const mentionMatches = message.match(/@([\w\u4e00-\u9fff-]+)/gu)
    const mentions = mentionMatches
      ? mentionMatches.map((m) => m.slice(1).toLowerCase())
      : []

    onSend(message.trim(), mentions, replyTo || undefined)
    setMessage('')
    onTyping(false)
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setMessage(val)

    // Check for @ at cursor
    const cursorPos = e.target.selectionStart || val.length
    const textBeforeCursor = val.slice(0, cursorPos)
    const atMatch = textBeforeCursor.match(/@([\w\u4e00-\u9fff-]*)$/u)
    if (atMatch) {
      setShowMentions(true)
      setMentionFilter(atMatch[1].toLowerCase())
      setHighlightedIndex(0)
    } else {
      setShowMentions(false)
    }

    // Typing indicator
    onTyping(true)
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }
    typingTimeoutRef.current = setTimeout(() => {
      onTyping(false)
    }, 2000)
  }

  const insertMention = (name: string) => {
    const cursorPos = inputRef.current?.selectionStart || message.length
    const textBeforeCursor = message.slice(0, cursorPos)
    const textAfterCursor = message.slice(cursorPos)
    const newBefore = textBeforeCursor.replace(/@\w*$/, `@${name} `)
    setMessage(newBefore + textAfterCursor)
    setShowMentions(false)
    inputRef.current?.focus()
  }

  // Build mention entries: LLMs, then @all, then humans
  const mentionEntries = useMemo(() => {
    const entries: MentionEntry[] = []

    for (const l of llms) {
      entries.push({
        id: l.id,
        label: l.display_name,
        sublabel: l.model,
        type: 'llm',
        mentionText: l.display_name.replace(/\s+/g, '_'),
      })
    }

    entries.push({
      id: 'all',
      label: 'all',
      sublabel: 'Mention all LLMs',
      type: 'special',
      mentionText: 'all',
    })

    // Exclude self from mentions
    for (const p of participants) {
      if (p.id === userId) continue
      entries.push({
        id: p.id,
        label: p.name,
        type: 'human',
        mentionText: p.name.replace(/\s+/g, '_'),
      })
    }

    return entries
  }, [llms, participants, userId])

  const filtered = useMemo(
    () =>
      mentionEntries.filter(
        (e) =>
          e.label.toLowerCase().includes(mentionFilter) ||
          e.id.toLowerCase().includes(mentionFilter)
      ),
    [mentionEntries, mentionFilter]
  )

  return (
    <div className="relative">
      {/* Reply bar */}
      {replyTo && replyToMessage && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-canvas-300 border border-canvas-400 rounded-t-sm text-xs text-ink-600 -mb-px">
          <span>
            Replying to <span className="font-medium text-ink-900">{replyToMessage.sender.name}</span>
          </span>
          <span className="text-ink-500 truncate flex-1">
            {replyToMessage.content.slice(0, 60)}
          </span>
          <button
            onClick={onCancelReply}
            className="text-ink-500 hover:text-ink-900 ml-auto flex-shrink-0"
          >
            &times;
          </button>
        </div>
      )}

      {/* Mention dropdown */}
      {showMentions && filtered.length > 0 && (
        <div className="absolute bottom-full mb-1 left-0 bg-white border border-canvas-400 rounded-sm overflow-hidden shadow-lg max-h-48 overflow-y-auto">
          {filtered.map((entry, idx) => (
            <button
              key={`${entry.type}-${entry.id}`}
              onClick={() => insertMention(entry.mentionText)}
              className={`block w-full text-left px-3 py-2 text-sm text-ink-800 transition-colors ${
                idx === highlightedIndex ? 'bg-canvas-200' : 'hover:bg-canvas-200'
              }`}
            >
              <span
                className={
                  entry.type === 'llm'
                    ? 'text-vermillion-600'
                    : entry.type === 'special'
                    ? 'text-bronze-600'
                    : 'text-jade-600'
                }
              >
                @{entry.label}
              </span>
              {entry.sublabel && (
                <span className="text-ink-500 ml-2 text-xs">
                  {entry.sublabel}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          handleSend()
        }}
        className="flex gap-2"
      >
        {/* Input container with highlight overlay */}
        <div
          className={`flex-1 relative bg-white border border-canvas-400 focus-within:border-ink-500 ${
            replyTo ? 'rounded-b-sm rounded-t-none' : 'rounded-sm'
          }`}
        >
          {/* Highlight overlay - shows background highlights under the input text */}
          <div
            className="absolute inset-0 px-3 py-3 pointer-events-none overflow-hidden whitespace-pre text-sm"
            style={{ color: 'transparent' }}
            aria-hidden="true"
          >
            {parseMentions(message).map((segment, i) =>
              segment.type === 'mention' ? (
                <span key={i} className="bg-vermillion-200 rounded-sm">
                  {segment.content}
                </span>
              ) : (
                <span key={i}>{segment.content}</span>
              )
            )}
          </div>
          <input
            ref={inputRef}
            type="text"
            value={message}
            onChange={handleChange}
            onKeyDown={(e) => {
              if (!showMentions || filtered.length === 0) return
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setHighlightedIndex((i) => (i + 1) % filtered.length)
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setHighlightedIndex((i) => (i - 1 + filtered.length) % filtered.length)
              } else if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault()
                insertMention(filtered[highlightedIndex].mentionText)
              } else if (e.key === 'Escape') {
                e.preventDefault()
                setShowMentions(false)
              }
            }}
            placeholder="Type a message... (use @ to mention)"
            disabled={disabled}
            className="w-full px-3 py-3 bg-transparent text-sm text-ink-900 placeholder-ink-400 focus:outline-none disabled:opacity-50 relative"
          />
        </div>
        <button
          type="submit"
          disabled={!message.trim() || disabled}
          className="btn-ink disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  )
}

export const RoomChatInput = memo(RoomChatInputInner)
