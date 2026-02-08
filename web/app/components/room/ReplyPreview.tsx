'use client'

import { memo } from 'react'
import type { ChatMessage } from './types'

interface ReplyPreviewProps {
  replyMsg: ChatMessage | undefined
  replyToId: string
}

function ReplyPreviewInner({ replyMsg, replyToId }: ReplyPreviewProps) {
  const handleClick = () => {
    const el = document.getElementById(`msg-${replyToId}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.add('bg-blue-100')
      setTimeout(() => el.classList.remove('bg-blue-100'), 1500)
    }
  }

  if (!replyMsg) {
    return (
      <div className="text-xs text-slate-500 mb-1 pl-2 border-l-2 border-slate-300">
        replying to message
      </div>
    )
  }

  const truncated =
    replyMsg.content.length > 60
      ? replyMsg.content.slice(0, 60) + '...'
      : replyMsg.content

  return (
    <button
      onClick={handleClick}
      className="text-xs text-slate-500 mb-1 pl-2 border-l-2 border-slate-300 block text-left hover:text-slate-900 transition-colors"
    >
      <span className="font-medium">{replyMsg.sender.name}</span>: {truncated}
    </button>
  )
}

export const ReplyPreview = memo(ReplyPreviewInner)
