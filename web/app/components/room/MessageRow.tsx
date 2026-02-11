'use client'

import { memo, useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { formatTime, stripSenderPrefix, llmDisplayLabel, parseMentions, getAvatarColor, modelIdToDisplayName, convertEmojiShortcodes } from '../../lib/utils'
import { ReplyPreview } from './ReplyPreview'
import type { ChatMessage, LLMInfo, Participant } from './types'

interface MessageRowProps {
  message: ChatMessage
  isOwn: boolean
  llms: LLMInfo[]
  participants: Participant[]
  messages: ChatMessage[]
  onReply: (msgId: string) => void
  onUpdateLLM?: (update: { llm_id: string; display_name: string }) => void
  debugMode?: boolean
  messageRef: (el: HTMLDivElement | null) => void
}

function MessageRowInner({
  message,
  isOwn,
  llms,
  participants,
  messages,
  onReply,
  onUpdateLLM,
  debugMode = false,
  messageRef,
}: MessageRowProps) {
  const isLLM = message.sender.type === 'llm'
  const renderedContent = stripSenderPrefix(message.content, message.sender.name)
  const isEmpty = !renderedContent.trim()

  // Inline editing state for LLM names
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  // Hide empty LLM messages in non-debug mode
  if (isLLM && isEmpty && !debugMode) {
    return null
  }

  // Build display name
  const displayName = isLLM
    ? llmDisplayLabel(message.sender.id, llms)
    : message.sender.name

  // Build tooltip content for avatar hover
  const buildTooltip = (): string => {
    if (isLLM) {
      const llm = llms.find((l) => l.id === message.sender.id)
      if (llm) {
        const parts = [llm.display_name || llm.id]
        if (llm.model) parts.push(`Model: ${modelIdToDisplayName(llm.model)}`)
        if (llm.title) parts.push(`Title: ${llm.title}`)
        return parts.join('\n')
      }
      return message.sender.name
    } else {
      const participant = participants.find((p) => p.id === message.sender.id)
      if (participant) {
        const parts = [participant.name]
        if (participant.title) parts.push(`Title: ${participant.title}`)
        if (participant.is_online === false) parts.push('(offline)')
        return parts.join('\n')
      }
      return message.sender.name
    }
  }

  const handleNameClick = () => {
    if (isLLM && onUpdateLLM) {
      setEditValue(displayName)
      setIsEditing(true)
    }
  }

  const handleNameSave = () => {
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== displayName && onUpdateLLM) {
      onUpdateLLM({ llm_id: message.sender.id, display_name: trimmed })
    }
    setIsEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleNameSave()
    } else if (e.key === 'Escape') {
      setIsEditing(false)
    }
  }

  // Reply-to preview
  const replyMsg = message.reply_to
    ? messages.find((m) => m.id === message.reply_to)
    : undefined

  // Get avatar emoji if set
  const getAvatar = (): string | null => {
    if (isLLM) {
      const llm = llms.find((l) => l.id === message.sender.id)
      return llm?.avatar || null
    } else {
      const participant = participants.find((p) => p.id === message.sender.id)
      return participant?.avatar || null
    }
  }
  const emojiAvatar = getAvatar()

  // Avatar colors - consistent color per sender ID (fallback for non-emoji)
  const avatarBg = getAvatarColor(message.sender.id)
  const avatarLetter = displayName.charAt(0).toUpperCase()

  return (
    <div
      ref={messageRef}
      className="group flex gap-3 px-4 py-1.5 hover:bg-canvas-200/50 transition-colors"
    >
      {/* Avatar with tooltip */}
      <div
        className={`w-9 h-9 rounded-sm ${emojiAvatar ? 'bg-canvas-200' : avatarBg} flex-shrink-0 flex items-center justify-center ${emojiAvatar ? 'text-xl' : 'text-white text-sm font-medium'} cursor-default`}
        title={buildTooltip()}
      >
        {emojiAvatar || avatarLetter}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Header: name + time + reply button */}
        <div className="flex items-baseline gap-2">
          {isEditing ? (
            <input
              ref={inputRef}
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={handleNameSave}
              onKeyDown={handleKeyDown}
              className="text-sm font-bold text-vermillion-700 bg-vermillion-50 border border-vermillion-300 rounded-sm px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-vermillion-500"
              style={{ width: `${Math.max(editValue.length, 4) + 2}ch` }}
            />
          ) : (
            <span
              className={`text-sm font-bold ${isLLM ? 'text-vermillion-700 cursor-pointer hover:underline' : 'text-ink-900'}`}
              onClick={handleNameClick}
              title={isLLM && onUpdateLLM ? 'Click to edit name' : undefined}
            >
              {displayName}
            </span>
          )}
          <span className="text-xs text-ink-500">
            {formatTime(message.timestamp)}
          </span>
          <button
            onClick={() => onReply(message.id)}
            className="text-xs text-ink-400 hover:text-ink-700 opacity-0 group-hover:opacity-100 transition-opacity ml-2"
          >
            Reply
          </button>
        </div>

        {/* Reply preview */}
        {message.reply_to && (
          <ReplyPreview
            replyMsg={replyMsg}
            replyToId={message.reply_to}
          />
        )}

        {/* Message content */}
        <div className={`text-sm text-ink-800 ${isLLM ? 'prose prose-sm max-w-none' : ''}`}>
          {isEmpty ? (
            <span className="text-xs italic text-bronze-700 bg-bronze-50 px-2 py-1 rounded-sm">
              (empty response - LLM chose not to reply)
            </span>
          ) : isLLM ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {renderedContent}
            </ReactMarkdown>
          ) : (
            <span className="whitespace-pre-wrap">
              {parseMentions(renderedContent).map((segment, i) =>
                segment.type === 'mention' ? (
                  <span
                    key={i}
                    className="bg-vermillion-100 text-vermillion-700 px-1 rounded-sm font-medium"
                  >
                    {convertEmojiShortcodes(segment.content)}
                  </span>
                ) : (
                  <span key={i}>{convertEmojiShortcodes(segment.content)}</span>
                )
              )}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export const MessageRow = memo(MessageRowInner)
