'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  useRoomSocket,
  ChatMessage,
  Participant,
  LLMInfo,
} from '../../hooks/useRoomSocket'

// ---- Helpers ----

function getUserId(): string {
  if (typeof window === 'undefined') return ''
  let id = localStorage.getItem('grand-secretariat-user-id')
  if (!id) {
    id = crypto.randomUUID().slice(0, 12)
    localStorage.setItem('grand-secretariat-user-id', id)
  }
  return id
}

function getUserName(): string {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem('grand-secretariat-user-name') || ''
}

function setUserName(name: string) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('grand-secretariat-user-name', name)
  }
}

function formatTime(ts: number): string {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// ---- Components ----

function JoinDialog({
  onJoin,
}: {
  onJoin: (name: string) => void
}) {
  const [name, setName] = useState(getUserName())

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (name.trim()) {
      setUserName(name.trim())
      onJoin(name.trim())
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <form
        onSubmit={handleSubmit}
        className="bg-gray-800 p-6 rounded-lg border border-gray-700 w-80"
      >
        <h2 className="text-lg font-medium text-white mb-4">Join Room</h2>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your display name"
          autoFocus
          className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 mb-4"
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

function ParticipantsSidebar({
  participants,
  llms,
  streamingLLMs,
}: {
  participants: Participant[]
  llms: LLMInfo[]
  streamingLLMs: Record<string, any>
}) {
  return (
    <div className="w-48 flex-shrink-0 border-l border-gray-700 p-3 overflow-y-auto">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
        Online
      </h3>
      <ul className="space-y-2">
        {participants.map((p) => (
          <li key={p.id} className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
            <span className="text-sm text-gray-300 truncate">{p.name}</span>
          </li>
        ))}
      </ul>

      {llms.length > 0 && (
        <>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mt-5 mb-3">
            LLMs
          </h3>
          <ul className="space-y-2">
            {llms.map((l) => (
              <li key={l.id} className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    streamingLLMs[l.id] ? 'bg-yellow-400 animate-pulse' : 'bg-blue-400'
                  }`}
                />
                <span className="text-sm text-gray-300 truncate">
                  {l.display_name}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

function MessageBubble({
  message,
  isOwn,
}: {
  message: ChatMessage
  isOwn: boolean
}) {
  const isLLM = message.sender.type === 'llm'

  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-3`}>
      <div
        className={`max-w-[75%] ${
          isLLM
            ? 'bg-gray-750 border border-gray-600'
            : isOwn
            ? 'bg-blue-600'
            : 'bg-gray-700'
        } rounded-lg px-3 py-2`}
      >
        {!isOwn && (
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`text-xs font-medium ${
                isLLM ? 'text-blue-400' : 'text-gray-400'
              }`}
            >
              {message.sender.name}
            </span>
            <span className="text-xs text-gray-600">
              {formatTime(message.timestamp)}
            </span>
          </div>
        )}
        {isOwn && (
          <div className="flex justify-end mb-1">
            <span className="text-xs text-blue-200">
              {formatTime(message.timestamp)}
            </span>
          </div>
        )}
        {message.reply_to && (
          <div className="text-xs text-gray-500 mb-1 pl-2 border-l-2 border-gray-600">
            replying to message
          </div>
        )}
        <div
          className={`text-sm ${
            isLLM
              ? 'prose prose-invert prose-sm max-w-none'
              : ''
          }`}
        >
          {isLLM ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>
          ) : (
            <span className="whitespace-pre-wrap">{message.content}</span>
          )}
        </div>
      </div>
    </div>
  )
}

function StreamingBubble({
  llm_id,
  content,
  is_thinking,
  displayName,
}: {
  llm_id: string
  content: string
  is_thinking: boolean
  displayName: string
}) {
  return (
    <div className="flex justify-start mb-3">
      <div className="max-w-[75%] bg-gray-750 border border-gray-600 rounded-lg px-3 py-2">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-medium text-blue-400">
            {displayName}
          </span>
          {is_thinking && (
            <span className="text-xs text-yellow-400 animate-pulse">
              thinking...
            </span>
          )}
        </div>
        {content ? (
          <div className="text-sm prose prose-invert prose-sm max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </div>
        ) : is_thinking ? (
          <div className="flex gap-1 py-1">
            <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        ) : null}
        {!is_thinking && content && (
          <div className="h-0.5 bg-blue-400 animate-pulse mt-1 rounded" />
        )}
      </div>
    </div>
  )
}

function RoomChatInput({
  onSend,
  onTyping,
  llms,
  disabled,
}: {
  onSend: (content: string, mentions: string[]) => void
  onTyping: (isTyping: boolean) => void
  llms: LLMInfo[]
  disabled: boolean
}) {
  const [message, setMessage] = useState('')
  const [showMentions, setShowMentions] = useState(false)
  const [mentionFilter, setMentionFilter] = useState('')
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSend = () => {
    if (!message.trim() || disabled) return

    // Extract @mentions
    const mentionMatches = message.match(/@(\w+)/g)
    const mentions = mentionMatches
      ? mentionMatches.map((m) => m.slice(1).toLowerCase())
      : []

    onSend(message.trim(), mentions)
    setMessage('')
    onTyping(false)
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setMessage(val)

    // Check for @ at cursor
    const cursorPos = e.target.selectionStart || val.length
    const textBeforeCursor = val.slice(0, cursorPos)
    const atMatch = textBeforeCursor.match(/@(\w*)$/)
    if (atMatch) {
      setShowMentions(true)
      setMentionFilter(atMatch[1].toLowerCase())
    } else {
      setShowMentions(false)
    }

    // Typing indicator
    onTyping(true)
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }
    typingTimeoutRef.current = setTimeout(() => {
      onTyping(false)
    }, 2000)
  }

  const insertMention = (name: string) => {
    const cursorPos = inputRef.current?.selectionStart || message.length
    const textBeforeCursor = message.slice(0, cursorPos)
    const textAfterCursor = message.slice(cursorPos)
    const newBefore = textBeforeCursor.replace(/@\w*$/, `@${name} `)
    setMessage(newBefore + textAfterCursor)
    setShowMentions(false)
    inputRef.current?.focus()
  }

  const filteredLLMs = llms.filter(
    (l) =>
      l.display_name.toLowerCase().includes(mentionFilter) ||
      l.id.toLowerCase().includes(mentionFilter)
  )

  return (
    <div className="relative">
      {showMentions && filteredLLMs.length > 0 && (
        <div className="absolute bottom-full mb-1 left-0 bg-gray-800 border border-gray-600 rounded-lg overflow-hidden shadow-lg">
          {filteredLLMs.map((llm) => (
            <button
              key={llm.id}
              onClick={() => insertMention(llm.display_name.toLowerCase())}
              className="block w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 transition-colors"
            >
              <span className="text-blue-400">@{llm.display_name}</span>
              <span className="text-gray-500 ml-2 text-xs">{llm.model}</span>
            </button>
          ))}
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          handleSend()
        }}
        className="flex gap-2"
      >
        <input
          ref={inputRef}
          type="text"
          value={message}
          onChange={handleChange}
          placeholder="Type a message... (use @ to mention an LLM)"
          disabled={disabled}
          className="flex-1 px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!message.trim() || disabled}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 rounded-lg text-sm font-medium text-white transition-colors"
        >
          Send
        </button>
      </form>
    </div>
  )
}

// ---- Main Page ----

export default function RoomPage() {
  const params = useParams()
  const router = useRouter()
  const roomId = params.id as string
  const [joined, setJoined] = useState(false)
  const [userId] = useState(getUserId)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const {
    room,
    participants,
    messages,
    llms,
    streamingLLMs,
    typingUsers,
    error,
    isConnected,
    connect,
    sendMessage,
    sendTyping,
  } = useRoomSocket(roomId)

  const handleJoin = useCallback(
    (name: string) => {
      connect(userId, name)
      setJoined(true)
    },
    [connect, userId]
  )

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingLLMs])

  if (!joined) {
    return <JoinDialog onJoin={handleJoin} />
  }

  return (
    <div className="h-screen bg-gray-900 text-gray-100 flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-gray-700 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/rooms')}
            className="text-gray-400 hover:text-white text-sm"
          >
            &larr; Rooms
          </button>
          <h1 className="text-lg font-medium">{room?.name || 'Loading...'}</h1>
          {!isConnected && (
            <span className="text-xs text-red-400">Disconnected</span>
          )}
        </div>
        <div className="text-xs text-gray-500">
          {participants.length} online
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex-shrink-0 bg-red-900/30 border-b border-red-800 px-4 py-2 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Messages */}
        <div className="flex-1 flex flex-col">
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {messages.length === 0 && (
              <p className="text-gray-600 text-center mt-8">
                No messages yet. Say something or @mention an LLM!
              </p>
            )}
            {messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                isOwn={msg.sender.id === userId}
              />
            ))}

            {/* Streaming LLM responses */}
            {Object.entries(streamingLLMs).map(([llmId, s]) => {
              const llmInfo = llms.find((l) => l.id === llmId)
              return (
                <StreamingBubble
                  key={llmId}
                  llm_id={llmId}
                  content={s.content}
                  is_thinking={s.is_thinking}
                  displayName={llmInfo?.display_name || llmId}
                />
              )
            })}

            {/* Typing indicators */}
            {typingUsers.length > 0 && (
              <div className="text-xs text-gray-500 ml-2 mb-2">
                {typingUsers.map((u) => u.name).join(', ')}{' '}
                {typingUsers.length === 1 ? 'is' : 'are'} typing...
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="flex-shrink-0 border-t border-gray-700 px-4 py-3">
            <RoomChatInput
              onSend={sendMessage}
              onTyping={sendTyping}
              llms={llms}
              disabled={!isConnected}
            />
          </div>
        </div>

        {/* Sidebar */}
        <ParticipantsSidebar
          participants={participants}
          llms={llms}
          streamingLLMs={streamingLLMs}
        />
      </div>
    </div>
  )
}
