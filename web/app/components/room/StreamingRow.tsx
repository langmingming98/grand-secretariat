'use client'

import { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ReplyPreview } from './ReplyPreview'
import { getAvatarColor } from '../../lib/utils'
import type { ChatMessage, DisplayMode } from './types'

/**
 * Get complete paragraphs from streaming content.
 * In Slack mode, we only show paragraphs that have been "completed" (followed by a double newline).
 */
export function getCompleteParagraphs(content: string): { complete: string; hasMore: boolean } {
  const lastBreak = content.lastIndexOf('\n\n')
  if (lastBreak === -1) {
    return { complete: '', hasMore: content.length > 0 }
  }
  return { complete: content.slice(0, lastBreak).trim(), hasMore: true }
}

interface StreamingRowProps {
  llm_id: string
  content: string
  is_thinking: boolean
  displayName: string
  replyToId?: string
  messages: ChatMessage[]
  displayMode?: DisplayMode
}

function StreamingRowInner({
  llm_id,
  content,
  is_thinking,
  displayName,
  replyToId,
  messages,
  displayMode = 'stream',
}: StreamingRowProps) {
  const replyMsg = replyToId
    ? messages.find((m) => m.id === replyToId)
    : undefined

  const avatarLetter = displayName.charAt(0).toUpperCase()
  const avatarBg = getAvatarColor(llm_id)

  // Don't render if no content and not thinking (opt-out case)
  if (!content && !is_thinking) {
    return null
  }

  // In Slack mode, only show complete paragraphs
  const isSlackMode = displayMode === 'slack'
  const { complete: completeParagraphs, hasMore } = isSlackMode
    ? getCompleteParagraphs(content)
    : { complete: content, hasMore: false }

  // Content to display
  const displayContent = isSlackMode ? completeParagraphs : content

  // In Slack mode, don't render anything if no complete paragraphs yet
  if (isSlackMode && !displayContent) {
    return null
  }

  return (
    <div className="group flex gap-3 px-4 py-1.5 bg-blue-50/50">
      {/* Avatar */}
      <div className={`w-9 h-9 rounded ${avatarBg} flex-shrink-0 flex items-center justify-center text-white text-sm font-medium`}>
        {avatarLetter}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-bold text-blue-700">
            {displayName}
          </span>
          {/* In stream mode, show typing indicator in the row */}
          {!isSlackMode && is_thinking && (
            <span className="text-xs text-amber-600 animate-pulse">
              thinking...
            </span>
          )}
          {!isSlackMode && !is_thinking && content && (
            <span className="text-xs text-blue-500 animate-pulse">
              typing...
            </span>
          )}
          {/* In Slack mode, typing indicator is shown as banner above input, not here */}
        </div>

        {/* Reply preview */}
        {replyToId && (
          <ReplyPreview replyMsg={replyMsg} replyToId={replyToId} />
        )}

        {/* Content */}
        {displayContent ? (
          <div className="text-sm text-slate-800 prose prose-sm max-w-none prose-slate">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{displayContent}</ReactMarkdown>
          </div>
        ) : null}

        {/* Typing indicator (bouncing dots) - only in stream mode */}
        {!isSlackMode && is_thinking && !content && (
          <div className="flex gap-1 py-1">
            <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        )}
      </div>
    </div>
  )
}

export const StreamingRow = memo(StreamingRowInner)
