'use client'

import { useState, memo } from 'react'
import { getUserName, setUserName } from '../../lib/storage'

interface JoinDialogProps {
  onJoin: (name: string) => void
}

function JoinDialogInner({ onJoin }: JoinDialogProps) {
  const [name, setName] = useState(getUserName())

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (name.trim()) {
      setUserName(name.trim())
      onJoin(name.trim())
    }
  }

  return (
    <div className="min-h-screen bg-canvas-100 flex items-center justify-center">
      <form
        onSubmit={handleSubmit}
        className="card-canvas p-6 w-80"
      >
        <h2 className="text-lg font-display font-semibold text-ink-900 mb-4">Join Room</h2>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your display name"
          autoFocus
          className="w-full px-3 py-2 bg-white border border-canvas-400 rounded-sm text-ink-900 placeholder-ink-400 focus:outline-none focus:border-ink-500 mb-4"
        />
        <button
          type="submit"
          disabled={!name.trim()}
          className="w-full btn-ink disabled:opacity-50"
        >
          Join
        </button>
      </form>
    </div>
  )
}

export const JoinDialog = memo(JoinDialogInner)
