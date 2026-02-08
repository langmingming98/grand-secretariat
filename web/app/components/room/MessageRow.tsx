'use client'

import { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { formatTime, stripSenderPrefix, llmDisplayLabel, parseMentions } from '../../lib/utils'
import { ReplyPreview } from './ReplyPreview'
import type { ChatMessage, LLMInfo } from './types'

interface MessageRowProps {
  message: ChatMessage
  isOwn: boolean
  llms: LLMInfo[]
  messages: ChatMessage[]
  onReply: (msgId: string) => void
  debugMode?: boolean
  messageRef: (el: HTMLDivElement | null) => void
}

function MessageRowInner({
  message,
  isOwn,
  llms,
  messages,
  onReply,
  debugMode = false,
  messageRef,
}: MessageRowProps) {
  const isLLM = message.sender.type === 'llm'
  const renderedContent = stripSenderPrefix(message.content, message.sender.name)
  const isEmpty = !renderedContent.trim()

  // Hide empty LLM messages in non-debug mode
  if (isLLM && isEmpty && !debugMode) {
    return null
  }

  // Build display name
  const displayName = isLLM
    ? llmDisplayLabel(message.sender.id, llms)
    : message.sender.name

  // Reply-to preview
  const replyMsg = message.reply_to
    ? messages.find((m) => m.id === message.reply_to)
    : undefined

  // Avatar colors
  const avatarBg = isLLM ? 'bg-blue-500' : 'bg-green-500'
  const avatarLetter = displayName.charAt(0).toUpperCase()

  return (
    <div
      ref={messageRef}
      className="group flex gap-3 px-4 py-1.5 hover:bg-slate-50 transition-colors"
    >
      {/* Avatar */}
      <div className={`w-9 h-9 rounded ${avatarBg} flex-shrink-0 flex items-center justify-center text-white text-sm font-medium`}>
        {avatarLetter}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Header: name + time + reply button */}
        <div className="flex items-baseline gap-2">
          <span className={`text-sm font-bold ${isLLM ? 'text-blue-700' : 'text-slate-900'}`}>
            {displayName}
          </span>
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
                    {segment.content}
                  </span>
                ) : (
                  <span key={i}>{segment.content}</span>
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
