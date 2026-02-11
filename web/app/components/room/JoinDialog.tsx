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
    <div className="min-h-screen bg-slate-100 flex items-center justify-center">
      <form
        onSubmit={handleSubmit}
        className="bg-white p-6 rounded-lg border border-slate-300 w-80 shadow-sm"
      >
        <h2 className="text-lg font-medium text-slate-900 mb-4">Join Room</h2>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your display name"
          autoFocus
          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 mb-4"
        />
        <button
          type="submit"
          disabled={!name.trim()}
          className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg text-sm font-medium text-white transition-colors"
        >
          Join
        </button>
      </form>
    </div>
  )
}

export const JoinDialog = memo(JoinDialogInner)
