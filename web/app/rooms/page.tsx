'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface RoomSummary {
  room_id: string
  name: string
  created_at: string | null
  created_by: string
  llms: { id: string; model: string; display_name: string }[]
}

const DEFAULT_LLMS = [
  {
    id: 'claude',
    model: 'anthropic/claude-sonnet-4',
    persona: 'You are Claude, a helpful AI assistant by Anthropic. Be concise.',
    display_name: 'Claude',
  },
  {
    id: 'gpt',
    model: 'openai/gpt-5-mini',
    persona: 'You are GPT, a helpful AI assistant by OpenAI. Be concise.',
    display_name: 'GPT',
  },
  {
    id: 'gemini',
    model: 'google/gemini-2.5-flash',
    persona: 'You are Gemini, a helpful AI assistant by Google. Be concise.',
    display_name: 'Gemini',
  },
]

function getApiBase(): string {
  if (typeof window === 'undefined') return 'http://localhost:8000'
  const isLocalDev =
    window.location.hostname === 'localhost' && window.location.port === '3000'
  return isLocalDev ? 'http://localhost:8000' : ''
}

export default function RoomsPage() {
  const router = useRouter()
  const [rooms, setRooms] = useState<RoomSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [roomName, setRoomName] = useState('')
  const [selectedLLMs, setSelectedLLMs] = useState<Set<string>>(
    new Set(DEFAULT_LLMS.map((l) => l.id))
  )
  const [creating, setCreating] = useState(false)

  const fetchRooms = useCallback(async () => {
    try {
      const res = await fetch(`${getApiBase()}/api/rooms`)
      const data = await res.json()
      setRooms(data.rooms || [])
    } catch (err) {
      console.error('Failed to fetch rooms:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchRooms()
  }, [fetchRooms])

  const handleCreate = async () => {
    if (!roomName.trim()) return
    setCreating(true)
    try {
      const llms = DEFAULT_LLMS.filter((l) => selectedLLMs.has(l.id))
      const res = await fetch(`${getApiBase()}/api/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: roomName.trim(),
          llms,
          created_by: 'anonymous',
        }),
      })
      const data = await res.json()
      router.push(`/room/${data.room_id}`)
    } catch (err) {
      console.error('Failed to create room:', err)
    } finally {
      setCreating(false)
    }
  }

  const toggleLLM = (id: string) => {
    setSelectedLLMs((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold">Rooms</h1>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors"
          >
            {showCreate ? 'Cancel' : 'New Room'}
          </button>
        </div>

        {showCreate && (
          <div className="mb-8 p-4 bg-gray-800 rounded-lg border border-gray-700">
            <h2 className="text-lg font-medium mb-4">Create Room</h2>
            <input
              type="text"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              placeholder="Room name"
              className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 mb-4"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate()
              }}
            />
            <div className="mb-4">
              <p className="text-sm text-gray-400 mb-2">LLMs in this room:</p>
              <div className="flex flex-wrap gap-2">
                {DEFAULT_LLMS.map((llm) => (
                  <button
                    key={llm.id}
                    onClick={() => toggleLLM(llm.id)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      selectedLLMs.has(llm.id)
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                    }`}
                  >
                    {llm.display_name}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={handleCreate}
              disabled={!roomName.trim() || selectedLLMs.size === 0 || creating}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 rounded-lg text-sm font-medium transition-colors"
            >
              {creating ? 'Creating...' : 'Create'}
            </button>
          </div>
        )}

        {loading ? (
          <p className="text-gray-500">Loading rooms...</p>
        ) : rooms.length === 0 ? (
          <p className="text-gray-500">
            No rooms yet. Create one to get started.
          </p>
        ) : (
          <div className="space-y-3">
            {rooms.map((room) => (
              <button
                key={room.room_id}
                onClick={() => router.push(`/room/${room.room_id}`)}
                className="w-full text-left p-4 bg-gray-800 hover:bg-gray-750 border border-gray-700 hover:border-gray-600 rounded-lg transition-colors"
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">{room.name}</h3>
                  <span className="text-xs text-gray-500">
                    {room.created_at
                      ? new Date(room.created_at).toLocaleDateString()
                      : ''}
                  </span>
                </div>
                {room.llms.length > 0 && (
                  <div className="mt-2 flex gap-2">
                    {room.llms.map((llm) => (
                      <span
                        key={llm.id}
                        className="text-xs px-2 py-0.5 bg-gray-700 text-gray-300 rounded"
                      >
                        {llm.display_name}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
