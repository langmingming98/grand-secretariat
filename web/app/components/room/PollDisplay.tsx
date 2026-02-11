'use client'

import { useState, useMemo, memo } from 'react'
import type { Poll } from '../../hooks/useRoomSocket'

interface PollDisplayProps {
  poll: Poll
  userId: string
  onVote: (pollId: string, optionIds: string[], reason?: string) => void
  onClose: (pollId: string) => void
}

function PollDisplayInner({ poll, userId, onVote, onClose }: PollDisplayProps) {
  const [selectedOptions, setSelectedOptions] = useState<Set<string>>(new Set())
  const [reason, setReason] = useState('')
  const [showReason, setShowReason] = useState(false)

  const isOpen = poll.status === 'open'
  const isCreator = poll.creator_id === userId

  // Check if user already voted
  const userVotes = useMemo(() => {
    const votes: string[] = []
    for (const opt of poll.options) {
      if (opt.votes.some((v) => v.voter_id === userId)) {
        votes.push(opt.id)
      }
    }
    return new Set(votes)
  }, [poll.options, userId])

  const hasVoted = userVotes.size > 0

  // Total votes across all options
  const totalVotes = useMemo(
    () => poll.options.reduce((sum, opt) => sum + opt.votes.length, 0),
    [poll.options]
  )

  const handleOptionClick = (optionId: string) => {
    if (!isOpen || hasVoted) return

    setSelectedOptions((prev) => {
      const next = new Set(prev)
      if (next.has(optionId)) {
        next.delete(optionId)
      } else {
        if (!poll.allow_multiple) {
          next.clear()
        }
        next.add(optionId)
      }
      return next
    })
  }

  const handleVote = () => {
    if (selectedOptions.size === 0) return
    onVote(poll.poll_id, Array.from(selectedOptions), reason || undefined)
    setSelectedOptions(new Set())
    setReason('')
    setShowReason(false)
  }

  return (
    <div className="bg-canvas-100 border border-canvas-300 rounded-sm shadow-sm overflow-hidden my-2 max-w-md">
      {/* Header */}
      <div className="px-4 py-3 bg-canvas-200 border-b border-canvas-300 flex items-start gap-2">
        <span className="text-lg">📊</span>
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-ink-900 text-sm">{poll.question}</h3>
          <p className="text-xs text-ink-500 mt-0.5">
            by {poll.creator_name} · {totalVotes} vote{totalVotes !== 1 ? 's' : ''}
            {poll.allow_multiple && ' · Multiple choice'}
          </p>
        </div>
        {poll.mandatory && isOpen && (
          <span className="px-2 py-0.5 bg-vermillion-100 text-vermillion-700 text-xs rounded-sm">
            Required
          </span>
        )}
        {!isOpen && (
          <span className="px-2 py-0.5 bg-canvas-300 text-ink-600 text-xs rounded-sm">
            Closed
          </span>
        )}
      </div>

      {/* Options */}
      <div className="p-3 space-y-2">
        {poll.options.map((opt) => {
          const voteCount = opt.votes.length
          const percentage = totalVotes > 0 ? (voteCount / totalVotes) * 100 : 0
          const isSelected = selectedOptions.has(opt.id)
          const wasVoted = userVotes.has(opt.id)

          return (
            <div key={opt.id}>
              <button
                onClick={() => handleOptionClick(opt.id)}
                disabled={!isOpen || hasVoted}
                className={`w-full text-left p-2 rounded-sm border transition-all relative overflow-hidden ${
                  isSelected
                    ? 'border-vermillion-500 bg-vermillion-50'
                    : wasVoted
                    ? 'border-jade-500 bg-jade-50'
                    : 'border-canvas-300 hover:border-canvas-400'
                } ${(!isOpen || hasVoted) && !wasVoted ? 'opacity-75' : ''}`}
              >
                {/* Background bar showing percentage - always visible for real-time results */}
                {totalVotes > 0 && (
                  <div
                    className={`absolute inset-0 ${wasVoted ? 'bg-jade-100' : 'bg-canvas-200'}`}
                    style={{ width: `${percentage}%` }}
                  />
                )}

                <div className="relative flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {poll.allow_multiple ? (
                      <span
                        className={`w-4 h-4 rounded border flex items-center justify-center text-xs ${
                          isSelected || wasVoted
                            ? 'bg-vermillion-600 border-vermillion-600 text-white'
                            : 'border-canvas-400'
                        }`}
                      >
                        {(isSelected || wasVoted) && '✓'}
                      </span>
                    ) : (
                      <span
                        className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                          isSelected || wasVoted
                            ? 'border-vermillion-600'
                            : 'border-canvas-400'
                        }`}
                      >
                        {(isSelected || wasVoted) && (
                          <span className="w-2 h-2 bg-vermillion-600 rounded-full" />
                        )}
                      </span>
                    )}
                    <span className="text-sm text-ink-800">{opt.text}</span>
                  </div>
                  {/* Always show vote counts in real-time */}
                  {totalVotes > 0 && (
                    <span className="text-xs text-ink-500">
                      {voteCount} ({percentage.toFixed(0)}%)
                    </span>
                  )}
                </div>

                {opt.description && (
                  <p className="relative text-xs text-ink-500 mt-1 ml-6">
                    {opt.description}
                  </p>
                )}
              </button>

              {/* Show voters - always visible for real-time feedback */}
              {opt.votes.length > 0 && !poll.anonymous && (
                <div className="mt-1 ml-6 text-xs text-ink-400">
                  {opt.votes.slice(0, 3).map((v, i) => (
                    <span key={v.voter_id}>
                      {i > 0 && ', '}
                      {v.voter_name}
                      {v.reason && `: "${v.reason}"`}
                    </span>
                  ))}
                  {opt.votes.length > 3 && ` +${opt.votes.length - 3} more`}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Actions */}
      {isOpen && !hasVoted && (
        <div className="px-3 pb-3 space-y-2">
          {showReason ? (
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why this choice? (optional)"
              className="w-full px-2 py-1 text-sm border border-canvas-300 rounded-sm focus:outline-none focus:border-ink-500 bg-white"
            />
          ) : (
            <button
              onClick={() => setShowReason(true)}
              className="text-xs text-ink-500 hover:text-ink-700"
            >
              + Add reasoning
            </button>
          )}
          <button
            onClick={handleVote}
            disabled={selectedOptions.size === 0}
            className="w-full py-1.5 bg-ink-800 hover:bg-ink-700 disabled:opacity-50 disabled:hover:bg-ink-800 text-white text-sm font-medium rounded-sm transition-colors"
          >
            Vote
          </button>
        </div>
      )}

      {isOpen && isCreator && (
        <div className="px-3 pb-3 border-t border-canvas-200 pt-2">
          <button
            onClick={() => onClose(poll.poll_id)}
            className="text-xs text-ink-500 hover:text-ink-700"
          >
            Close poll
          </button>
        </div>
      )}
    </div>
  )
}

export const PollDisplay = memo(PollDisplayInner)
