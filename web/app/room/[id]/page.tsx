'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useRoomSocket } from '../../hooks/useRoomSocket'
import { llmDisplayLabel } from '../../lib/utils'
import { getUserId, getUserName, setUserName, getUserTitle, setUserTitle, getDebugMode, setDebugMode } from '../../lib/storage'
import {
  JoinDialog,
  MessageRow,
  StreamingRow,
  RoomChatInput,
  ParticipantsSidebar,
  getCompleteParagraphs,
  DisplayMode,
} from '../../components/room'
import { PollDisplay } from '../../components/room/PollDisplay'
import { PollCreateModal } from '../../components/room/PollCreateModal'

export default function RoomPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const roomId = params.id as string
  const [joined, setJoined] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [title, setTitle] = useState('')
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [displayMode, setDisplayMode] = useState<DisplayMode>('stream')
  const [debugMode, setDebugModeState] = useState(false)
  const [showPollModal, setShowPollModal] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Initialize debug mode from localStorage on mount
  useEffect(() => {
    setDebugModeState(getDebugMode())
  }, [])

  // ?user=<name> query param for multi-user testing
  const devUser = searchParams.get('user')
  const [userId] = useState(() =>
    devUser ? `dev-${devUser}` : getUserId()
  )

  const {
    room,
    participants,
    messages,
    llms,
    polls,
    streamingLLMs,
    typingUsers,
    error,
    isConnected,
    wasConnected,
    connect,
    disconnect,
    sendMessage,
    sendTyping,
    addLLM,
    updateLLM,
    createPoll,
    castVote,
    closePoll,
  } = useRoomSocket(roomId)

  const handleJoin = useCallback(
    (name: string) => {
      const storedTitle = getUserTitle()
      setDisplayName(name)
      setTitle(storedTitle)
      connect(userId, name, 'member', storedTitle)
      setJoined(true)
    },
    [connect, userId]
  )

  // Auto-join: if ?user= param is set, or if user has previously set their name
  useEffect(() => {
    if (joined) return
    if (devUser) {
      setDisplayName(devUser)
      const storedTitle = getUserTitle()
      setTitle(storedTitle)
      connect(userId, devUser, 'member', storedTitle)
      setJoined(true)
      return
    }
    const storedName = getUserName()
    if (storedName) {
      const storedTitle = getUserTitle()
      setDisplayName(storedName)
      setTitle(storedTitle)
      connect(userId, storedName, 'member', storedTitle)
      setJoined(true)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingLLMs])

  const handleSend = useCallback(
    (content: string, mentions: string[], msgReplyTo?: string) => {
      sendMessage(content, mentions, msgReplyTo)
      setReplyTo(null)
    },
    [sendMessage]
  )

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleToggleDebug = () => {
    const newValue = !debugMode
    setDebugModeState(newValue)
    setDebugMode(newValue)
  }

  const handleUpdateSelf = useCallback(
    (name: string, newTitle: string) => {
      setUserName(name)
      setUserTitle(newTitle)
      setDisplayName(name)
      setTitle(newTitle)
      // Reconnect with new name/title
      disconnect()
      connect(userId, name, 'member', newTitle)
    },
    [disconnect, connect, userId]
  )

  const replyToMessage = replyTo
    ? messages.find((m) => m.id === replyTo)
    : undefined

  if (!joined) {
    return <JoinDialog onJoin={handleJoin} />
  }

  return (
    <div className="h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-slate-200 px-4 py-3 flex items-center justify-between bg-white">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <button
            onClick={() => router.push('/rooms')}
            className="text-slate-500 hover:text-slate-900 text-sm flex-shrink-0"
          >
            &larr; Rooms
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-medium truncate">{room?.name || 'Loading...'}</h1>
              <button
                onClick={handleCopyLink}
                className="text-slate-500 hover:text-slate-900 text-xs px-2 py-1 rounded border border-slate-300 hover:border-slate-400 transition-colors flex-shrink-0"
              >
                {copied ? 'Copied!' : 'Copy link'}
              </button>
              {wasConnected && !isConnected && (
                <span className="text-xs text-red-400 flex-shrink-0">Disconnected</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <button
            onClick={() => setShowPollModal(true)}
            disabled={!isConnected}
            className="px-2 py-1 rounded border border-slate-300 hover:border-slate-400 text-slate-600 disabled:opacity-50 transition-colors"
            title="Create a poll"
          >
            📊 Poll
          </button>
          <button
            onClick={() => setDisplayMode(displayMode === 'stream' ? 'slack' : 'stream')}
            className={`px-2 py-1 rounded border transition-colors ${
              displayMode === 'slack'
                ? 'border-blue-400 bg-blue-50 text-blue-700'
                : 'border-slate-300 hover:border-slate-400 text-slate-600'
            }`}
            title={displayMode === 'stream' ? 'Switch to Slack mode (paragraphs)' : 'Switch to Stream mode (live)'}
          >
            {displayMode === 'stream' ? 'Stream' : 'Slack'}
          </button>
          <button
            onClick={handleToggleDebug}
            className={`px-2 py-1 rounded border transition-colors ${
              debugMode
                ? 'border-amber-400 bg-amber-50 text-amber-700'
                : 'border-slate-300 hover:border-slate-400 text-slate-600'
            }`}
            title={debugMode ? 'Hide debug info (empty messages, etc.)' : 'Show debug info (empty messages, etc.)'}
          >
            {debugMode ? 'Debug' : 'Debug'}
          </button>
          <span>{participants.length} online</span>
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
              <p className="text-slate-500 text-center mt-8">
                No messages yet. Say something or @mention an LLM!
              </p>
            )}
            {messages.map((msg) => {
              // If message has a poll_id, render as poll
              if (msg.poll_id) {
                const poll = polls.find((p) => p.poll_id === msg.poll_id)
                if (poll) {
                  return (
                    <div key={msg.id} id={`msg-${msg.id}`} className="mb-3">
                      <PollDisplay
                        poll={poll}
                        userId={userId}
                        onVote={castVote}
                        onClose={closePoll}
                      />
                    </div>
                  )
                }
              }
              // Regular message
              return (
                <MessageRow
                  key={msg.id}
                  message={msg}
                  isOwn={msg.sender.id === userId}
                  llms={llms}
                  messages={messages}
                  onReply={setReplyTo}
                  debugMode={debugMode}
                  messageRef={(el) => {
                    if (el) el.id = `msg-${msg.id}`
                  }}
                />
              )
            })}

            {/* Streaming LLM responses */}
            {Object.entries(streamingLLMs).map(([llmId, s]) => (
              <StreamingRow
                key={llmId}
                llm_id={llmId}
                content={s.content}
                is_thinking={s.is_thinking}
                displayName={llmDisplayLabel(llmId, llms)}
                replyToId={s.reply_to}
                messages={messages}
                displayMode={displayMode}
              />
            ))}

            <div ref={messagesEndRef} />
          </div>

          {/* Typing indicator banner */}
          {(() => {
            // Collect all typing names (humans + LLMs in both modes)
            const typingNames = typingUsers.map((u) => u.name)
            // In Slack mode, LLMs that are streaming are "typing" (shown via banner instead of in-message)
            if (displayMode === 'slack') {
              Object.entries(streamingLLMs).forEach(([llmId, s]) => {
                const { complete } = getCompleteParagraphs(s.content)
                if (s.is_thinking || (s.content && !complete)) {
                  const name = llmDisplayLabel(llmId, llms)
                  if (!typingNames.includes(name)) {
                    typingNames.push(name)
                  }
                }
              })
            }
            if (typingNames.length === 0) return null
            return (
              <div className="flex-shrink-0 px-4 py-2 bg-amber-50 border-t border-amber-200">
                <span className="text-xs text-amber-700">
                  {typingNames.join(', ')}{' '}
                  {typingNames.length === 1 ? 'is' : 'are'} typing...
                </span>
              </div>
            )
          })()}

          {/* Input */}
          <div className="flex-shrink-0 border-t border-slate-200 px-4 py-3 bg-white">
            <RoomChatInput
              onSend={handleSend}
              onTyping={sendTyping}
              llms={llms}
              participants={participants}
              userId={userId}
              disabled={!isConnected}
              replyTo={replyTo}
              replyToMessage={replyToMessage}
              onCancelReply={() => setReplyTo(null)}
            />
          </div>
        </div>

        {/* Sidebar */}
        <ParticipantsSidebar
          participants={participants}
          llms={llms}
          streamingLLMs={streamingLLMs}
          userId={userId}
          userName={displayName}
          userTitle={title}
          roomDescription={room?.description}
          onAddLLM={addLLM}
          onUpdateLLM={updateLLM}
          onUpdateSelf={handleUpdateSelf}
        />
      </div>

      {/* Poll creation modal */}
      {showPollModal && (
        <PollCreateModal
          onClose={() => setShowPollModal(false)}
          onCreate={createPoll}
        />
      )}
    </div>
  )
}
