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
    <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden my-2 max-w-md">
      {/* Header */}
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-start gap-2">
        <span className="text-lg">📊</span>
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-slate-900 text-sm">{poll.question}</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            by {poll.creator_name} · {totalVotes} vote{totalVotes !== 1 ? 's' : ''}
            {poll.allow_multiple && ' · Multiple choice'}
          </p>
        </div>
        {poll.mandatory && isOpen && (
          <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">
            Required
          </span>
        )}
        {!isOpen && (
          <span className="px-2 py-0.5 bg-slate-200 text-slate-600 text-xs rounded-full">
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
                className={`w-full text-left p-2 rounded-md border transition-all relative overflow-hidden ${
                  isSelected
                    ? 'border-blue-500 bg-blue-50'
                    : wasVoted
                    ? 'border-green-500 bg-green-50'
                    : 'border-slate-200 hover:border-slate-300'
                } ${(!isOpen || hasVoted) && !wasVoted ? 'opacity-75' : ''}`}
              >
                {/* Background bar showing percentage - always visible for real-time results */}
                {totalVotes > 0 && (
                  <div
                    className={`absolute inset-0 ${wasVoted ? 'bg-green-100' : 'bg-slate-100'}`}
                    style={{ width: `${percentage}%` }}
                  />
                )}

                <div className="relative flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {poll.allow_multiple ? (
                      <span
                        className={`w-4 h-4 rounded border flex items-center justify-center text-xs ${
                          isSelected || wasVoted
                            ? 'bg-blue-500 border-blue-500 text-white'
                            : 'border-slate-300'
                        }`}
                      >
                        {(isSelected || wasVoted) && '✓'}
                      </span>
                    ) : (
                      <span
                        className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                          isSelected || wasVoted
                            ? 'border-blue-500'
                            : 'border-slate-300'
                        }`}
                      >
                        {(isSelected || wasVoted) && (
                          <span className="w-2 h-2 bg-blue-500 rounded-full" />
                        )}
                      </span>
                    )}
                    <span className="text-sm text-slate-800">{opt.text}</span>
                  </div>
                  {/* Always show vote counts in real-time */}
                  {totalVotes > 0 && (
                    <span className="text-xs text-slate-500">
                      {voteCount} ({percentage.toFixed(0)}%)
                    </span>
                  )}
                </div>

                {opt.description && (
                  <p className="relative text-xs text-slate-500 mt-1 ml-6">
                    {opt.description}
                  </p>
                )}
              </button>

              {/* Show voters - always visible for real-time feedback */}
              {opt.votes.length > 0 && !poll.anonymous && (
                <div className="mt-1 ml-6 text-xs text-slate-400">
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
              className="w-full px-2 py-1 text-sm border border-slate-200 rounded focus:outline-none focus:border-blue-400"
            />
          ) : (
            <button
              onClick={() => setShowReason(true)}
              className="text-xs text-slate-500 hover:text-slate-700"
            >
              + Add reasoning
            </button>
          )}
          <button
            onClick={handleVote}
            disabled={selectedOptions.size === 0}
            className="w-full py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 text-white text-sm font-medium rounded transition-colors"
          >
            Vote
          </button>
        </div>
      )}

      {isOpen && isCreator && (
        <div className="px-3 pb-3 border-t border-slate-100 pt-2">
          <button
            onClick={() => onClose(poll.poll_id)}
            className="text-xs text-slate-500 hover:text-slate-700"
          >
            Close poll
          </button>
        </div>
      )}
    </div>
  )
}

export const PollDisplay = memo(PollDisplayInner)
