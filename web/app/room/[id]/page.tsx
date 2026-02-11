'use client'

import { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react'
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
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true)
  const isAutoScrollingRef = useRef(false) // Flag to ignore scroll events during programmatic scroll
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const prevScrollHeightRef = useRef<number>(0) // For preserving scroll position when prepending
  const prevMessageCountRef = useRef<number>(0)

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
    isReconnecting,
    reconnectAttempt,
    isLoadingHistory,
    hasMoreHistory,
    connect,
    disconnect,
    sendMessage,
    sendTyping,
    addLLM,
    updateLLM,
    removeLLM,
    createPoll,
    castVote,
    closePoll,
    loadHistory,
    updateRoomDescription,
  } = useRoomSocket(roomId)

  // Track scroll: disable auto-scroll when user scrolls away from bottom, load history when near top
  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current
    if (!container) return

    // Ignore scroll events triggered by our own scrollIntoView
    if (isAutoScrollingRef.current) return

    const { scrollTop, scrollHeight, clientHeight } = container
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight
    const isNearBottom = distanceFromBottom < 100 // 100px threshold

    if (isNearBottom) {
      // User scrolled to bottom - re-enable auto-scroll
      setAutoScrollEnabled(true)
    } else {
      // User scrolled away from bottom - disable auto-scroll
      setAutoScrollEnabled(false)
    }

    // Load more history when scrolled near top
    const isNearTop = scrollTop < 100
    if (isNearTop && hasMoreHistory && !isLoadingHistory) {
      loadHistory()
    }
  }, [hasMoreHistory, isLoadingHistory, loadHistory])

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

  // Auto-scroll on new messages only if auto-scroll is enabled
  useEffect(() => {
    if (autoScrollEnabled && messagesEndRef.current) {
      // Set flag to ignore scroll events during programmatic scroll
      isAutoScrollingRef.current = true
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })

      // Clear flag after scroll animation completes (smooth scroll takes ~300-500ms)
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current)
      scrollTimeoutRef.current = setTimeout(() => {
        isAutoScrollingRef.current = false
      }, 500)
    }
  }, [messages, streamingLLMs, autoScrollEnabled])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current)
    }
  }, [])

  // Preserve scroll position when prepending older messages
  // Save scrollHeight before render
  useEffect(() => {
    const container = messagesContainerRef.current
    if (container) {
      prevScrollHeightRef.current = container.scrollHeight
      prevMessageCountRef.current = messages.length
    }
  })

  // Adjust scroll position after render if messages were prepended
  useLayoutEffect(() => {
    const container = messagesContainerRef.current
    if (!container) return

    // Check if messages were prepended (more messages, scroll was at top area)
    const scrollHeightDiff = container.scrollHeight - prevScrollHeightRef.current
    if (scrollHeightDiff > 0 && container.scrollTop < 150) {
      // Messages were prepended, adjust scroll to maintain position
      container.scrollTop = scrollHeightDiff
    }
  }, [messages.length])

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
                <span className={`text-xs flex-shrink-0 flex items-center gap-1 ${isReconnecting ? 'text-amber-500' : 'text-red-400'}`}>
                  {isReconnecting ? (
                    <>
                      <div className="w-3 h-3 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                      Reconnecting{reconnectAttempt > 1 ? ` (${reconnectAttempt})` : '...'}
                    </>
                  ) : (
                    'Disconnected'
                  )}
                </span>
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
          <span>{participants.filter(p => p.is_online !== false).length} online</span>
        </div>
      </div>

      {/* Reconnecting banner */}
      {isReconnecting && (
        <div className="flex-shrink-0 bg-amber-50 border-b border-amber-200 px-4 py-2 text-sm text-amber-700 flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          Reconnecting to room... {reconnectAttempt > 1 && `(attempt ${reconnectAttempt})`}
        </div>
      )}

      {/* Error banner - only show after first successful connection to avoid flash */}
      {error && wasConnected && !isReconnecting && (
        <div className="flex-shrink-0 bg-red-50 border-b border-red-200 px-4 py-2 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Messages */}
        <div className="flex-1 flex flex-col">
          <div
            ref={messagesContainerRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto px-4 py-3"
          >
            {messages.length === 0 && !room && (
              <div className="flex flex-col items-center justify-center mt-16">
                <div className="w-8 h-8 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin" />
                <p className="text-slate-500 text-sm mt-3">Loading room...</p>
              </div>
            )}
            {messages.length === 0 && room && (
              <div className="flex flex-col items-center justify-center mt-16 text-slate-500">
                <svg className="w-12 h-12 mb-3 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <p className="text-sm">No messages yet. Say something or @mention an LLM!</p>
              </div>
            )}

            {/* Load more history indicator */}
            {messages.length > 0 && (
              <div className="flex justify-center mb-4">
                {isLoadingHistory ? (
                  <div className="flex items-center gap-2 text-slate-500 text-sm">
                    <div className="w-4 h-4 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin" />
                    Loading older messages...
                  </div>
                ) : hasMoreHistory ? (
                  <button
                    onClick={loadHistory}
                    className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
                  >
                    Load older messages
                  </button>
                ) : (
                  <span className="text-xs text-slate-400">Beginning of conversation</span>
                )}
              </div>
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
                  participants={participants}
                  messages={messages}
                  onReply={setReplyTo}
                  onUpdateLLM={updateLLM}
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
          onRemoveLLM={removeLLM}
          onUpdateSelf={handleUpdateSelf}
          onUpdateRoomDescription={updateRoomDescription}
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
