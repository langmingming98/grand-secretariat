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
      className="group flex gap-3 px-4 py-1.5 hover:bg-slate-50 transition-colors"
    >
      {/* Avatar with tooltip */}
      <div
        className={`w-9 h-9 rounded ${emojiAvatar ? 'bg-slate-100' : avatarBg} flex-shrink-0 flex items-center justify-center ${emojiAvatar ? 'text-xl' : 'text-white text-sm font-medium'} cursor-default`}
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
              className="text-sm font-bold text-blue-700 bg-blue-50 border border-blue-300 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
              style={{ width: `${Math.max(editValue.length, 4) + 2}ch` }}
            />
          ) : (
            <span
              className={`text-sm font-bold ${isLLM ? 'text-blue-700 cursor-pointer hover:underline' : 'text-slate-900'}`}
              onClick={handleNameClick}
              title={isLLM && onUpdateLLM ? 'Click to edit name' : undefined}
            >
              {displayName}
            </span>
          )}
          <span className="text-xs text-slate-500">
            {formatTime(message.timestamp)}
          </span>
          <button
            onClick={() => onReply(message.id)}
            className="text-xs text-slate-400 hover:text-slate-700 opacity-0 group-hover:opacity-100 transition-opacity ml-2"
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
        <div className={`text-sm text-slate-800 ${isLLM ? 'prose prose-sm max-w-none prose-slate' : ''}`}>
          {isEmpty ? (
            <span className="text-xs italic text-amber-600 bg-amber-50 px-2 py-1 rounded">
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
                    className="bg-blue-100 text-blue-700 px-1 rounded font-medium"
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
