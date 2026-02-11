'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { getWsUrl, getApiBase } from '../lib/api'
import { stripSenderPrefix } from '../lib/utils'

// ---- Types ----

export interface Participant {
  id: string
  name: string
  role: number
  type: number // 1=human, 2=llm
  title?: string
  is_online?: boolean
  avatar?: string  // emoji avatar
}

export interface ChatMessage {
  id: string
  sender: { id: string; name: string; type: 'human' | 'llm' }
  content: string
  reply_to?: string
  timestamp: number
  poll_id?: string  // If set, this message is a poll
}

export interface LLMInfo {
  id: string
  model: string
  display_name: string
  persona?: string
  title?: string
  chat_style?: number  // 0=default, 1=conversational, 2=detailed, 3=bullet
  avatar?: string  // emoji avatar
}

export interface RoomInfo {
  id: string
  name: string
  description?: string
  created_at: string | null
  visibility?: 'public' | 'private'
}

export interface PollVote {
  voter_id: string
  voter_name: string
  reason: string
  voted_at: number
}

export interface PollOption {
  id: string
  text: string
  description: string
  votes: PollVote[]
}

export interface Poll {
  poll_id: string
  room_id: string
  creator_id: string
  creator_name: string
  creator_type: 'human' | 'llm'
  question: string
  options: PollOption[]
  allow_multiple: boolean
  anonymous: boolean
  mandatory: boolean
  status: 'open' | 'closed'
  created_at: number
  closed_at: number
}

interface StreamingLLM {
  message_id: string
  llm_id: string
  content: string
  reply_to: string
  is_thinking: boolean
}

interface TypingUser {
  id: string
  name: string
}

interface RoomState {
  room: RoomInfo | null
  participants: Participant[]
  messages: ChatMessage[]
  llms: LLMInfo[]
  polls: Poll[]
  streamingLLMs: Record<string, StreamingLLM>
  typingUsers: TypingUser[]
  error: string | null
  isConnected: boolean
  wasConnected: boolean // True after first successful connection
  isReconnecting: boolean
  reconnectAttempt: number
  // History pagination
  historyCursor: string | null
  isLoadingHistory: boolean
  hasMoreHistory: boolean
}

// Reconnection config
const RECONNECT_BASE_DELAY = 1000 // 1 second
const RECONNECT_MAX_DELAY = 30000 // 30 seconds
const RECONNECT_MAX_ATTEMPTS = 10

interface ConnectionParams {
  userId: string
  displayName: string
  role: string
  title: string
  avatar: string
}

// ---- Hook ----

export function useRoomSocket(roomId: string) {
  const wsRef = useRef<WebSocket | null>(null)
  const connectionParamsRef = useRef<ConnectionParams | null>(null)
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null)
  const intentionalCloseRef = useRef(false)

  const [state, setState] = useState<RoomState>({
    room: null,
    participants: [],
    messages: [],
    llms: [],
    polls: [],
    streamingLLMs: {},
    typingUsers: [],
    error: null,
    isConnected: false,
    wasConnected: false,
    isReconnecting: false,
    reconnectAttempt: 0,
    historyCursor: null,
    isLoadingHistory: false,
    hasMoreHistory: true, // Assume there's history until proven otherwise
  })

  const scheduleReconnect = useCallback(() => {
    setState((prev) => {
      if (prev.reconnectAttempt >= RECONNECT_MAX_ATTEMPTS) {
        return {
          ...prev,
          isReconnecting: false,
          error: 'Connection lost. Please refresh the page.',
        }
      }

      const attempt = prev.reconnectAttempt + 1
      const delay = Math.min(
        RECONNECT_BASE_DELAY * Math.pow(2, attempt - 1),
        RECONNECT_MAX_DELAY
      )

      reconnectTimerRef.current = setTimeout(() => {
        const params = connectionParamsRef.current
        if (params) {
          connectInternal(params.userId, params.displayName, params.role, params.title, params.avatar, true)
        }
      }, delay)

      return {
        ...prev,
        isReconnecting: true,
        reconnectAttempt: attempt,
      }
    })
  }, [])

  const connectInternal = useCallback(
    (userId: string, displayName: string, role: string, title: string, avatar: string, isReconnect: boolean = false) => {
      // Clear any pending reconnect
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }

      // Close existing connection
      if (wsRef.current) {
        intentionalCloseRef.current = true
        wsRef.current.close()
      }

      intentionalCloseRef.current = false

      const wsUrl = getWsUrl(`/ws/room/${roomId}`)
      const ws = new WebSocket(wsUrl)

      ws.onopen = () => {
        setState((prev) => ({
          ...prev,
          isConnected: true,
          wasConnected: true,
          isReconnecting: false,
          reconnectAttempt: 0,
          error: null,
        }))
        // Send join message
        ws.send(
          JSON.stringify({
            type: 'join',
            user_id: userId,
            name: displayName,
            role,
            title,
            avatar,
          })
        )
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          handleServerEvent(data)
        } catch (err) {
          console.error('Error parsing room message:', err)
        }
      }

      ws.onerror = () => {
        console.error('WebSocket error')
        // Don't set error here - wait for onclose to handle reconnection
      }

      ws.onclose = () => {
        wsRef.current = null

        setState((prev) => ({ ...prev, isConnected: false }))

        // Only attempt reconnect if:
        // - We have connection params (user was connected)
        // - Close wasn't intentional (user didn't call disconnect)
        // - We haven't exceeded max attempts
        if (
          connectionParamsRef.current &&
          !intentionalCloseRef.current
        ) {
          scheduleReconnect()
        }
      }

      wsRef.current = ws
    },
    [roomId, scheduleReconnect]
  )

  const connect = useCallback(
    (userId: string, displayName: string, role: string = 'member', title: string = '', avatar: string = '') => {
      // Store connection params for reconnection
      connectionParamsRef.current = { userId, displayName, role, title, avatar }
      connectInternal(userId, displayName, role, title, avatar, false)
    },
    [connectInternal]
  )

  const handleServerEvent = useCallback((data: any) => {
    switch (data.type) {
      case 'room_state':
        setState((prev) => ({
          ...prev,
          room: data.room,
          participants: data.participants || [],
          messages: (data.messages || []).map((msg: ChatMessage) => ({
            ...msg,
            content: stripSenderPrefix(msg.content, msg.sender.name),
          })),
          llms: data.llms || [],
          polls: data.polls || [],
        }))
        break

      case 'message':
        setState((prev) => {
          // Avoid duplicates (can happen during reconnection or server retry)
          const exists = prev.messages.some((m) => m.id === data.id)
          if (exists) return prev
          return {
            ...prev,
            messages: [
              ...prev.messages,
              {
                ...(data as ChatMessage),
                content: stripSenderPrefix(data.content, data.sender?.name || ''),
              },
            ],
          }
        })
        break

      case 'user_joined':
        setState((prev) => {
          // Avoid duplicates
          const exists = prev.participants.some(
            (p) => p.id === data.user.id
          )
          return {
            ...prev,
            participants: exists
              ? prev.participants.map((p) =>
                  p.id === data.user.id ? { ...p, ...data.user } : p
                )
              : [...prev.participants, data.user],
          }
        })
        break

      case 'user_left':
        setState((prev) => ({
          ...prev,
          participants: prev.participants.map((p) =>
            p.id === data.user_id ? { ...p, is_online: false } : p
          ),
        }))
        break

      case 'llm_thinking':
        setState((prev) => ({
          ...prev,
          streamingLLMs: {
            ...prev.streamingLLMs,
            [data.llm_id]: {
              message_id: '',
              llm_id: data.llm_id,
              content: '',
              reply_to: data.reply_to,
              is_thinking: true,
            },
          },
        }))
        break

      case 'llm_chunk':
        setState((prev) => {
          const existing = prev.streamingLLMs[data.llm_id]
          return {
            ...prev,
            streamingLLMs: {
              ...prev.streamingLLMs,
              [data.llm_id]: {
                message_id: data.message_id,
                llm_id: data.llm_id,
                content: (existing?.content || '') + data.content,
                // Preserve reply_to from thinking event if chunk doesn't have it
                reply_to: data.reply_to || existing?.reply_to || '',
                is_thinking: false,
              },
            },
          }
        })
        break

      case 'llm_done': {
        setState((prev) => {
          const streaming = prev.streamingLLMs[data.llm_id]
          if (!streaming) return prev

          // Check if this message already exists (e.g., from reconnection)
          const exists = prev.messages.some((m) => m.id === data.message_id)
          if (exists) {
            // Just clear the streaming state
            const { [data.llm_id]: _, ...remainingStreaming } = prev.streamingLLMs
            return { ...prev, streamingLLMs: remainingStreaming }
          }

          // Move the completed LLM response into messages
          const llmInfo = prev.llms.find((l) => l.id === data.llm_id)
          const newMessage: ChatMessage = {
            id: data.message_id,
            sender: {
              id: data.llm_id,
              name: llmInfo?.display_name || data.llm_id,
              type: 'llm',
            },
            content: stripSenderPrefix(
              streaming.content,
              llmInfo?.display_name || data.llm_id
            ),
            reply_to: streaming.reply_to,
            timestamp: Date.now(),
          }

          const { [data.llm_id]: _, ...remainingStreaming } =
            prev.streamingLLMs

          return {
            ...prev,
            messages: [...prev.messages, newMessage],
            streamingLLMs: remainingStreaming,
          }
        })
        break
      }

      case 'typing':
        setState((prev) => {
          if (data.is_typing) {
            const exists = prev.typingUsers.some(
              (u) => u.id === data.user.id
            )
            return {
              ...prev,
              typingUsers: exists
                ? prev.typingUsers
                : [
                    ...prev.typingUsers,
                    { id: data.user.id, name: data.user.name },
                  ],
            }
          } else {
            return {
              ...prev,
              typingUsers: prev.typingUsers.filter(
                (u) => u.id !== data.user.id
              ),
            }
          }
        })
        break

      case 'llm_added':
        setState((prev) => {
          const exists = prev.llms.some((l) => l.id === data.llm.id)
          return {
            ...prev,
            llms: exists ? prev.llms : [...prev.llms, data.llm],
          }
        })
        break

      case 'llm_updated':
        setState((prev) => ({
          ...prev,
          llms: prev.llms.map((l) =>
            l.id === data.llm.id ? { ...l, ...data.llm } : l
          ),
        }))
        break

      case 'llm_removed':
        setState((prev) => ({
          ...prev,
          llms: prev.llms.filter((l) => l.id !== data.llm_id),
        }))
        break

      case 'poll_created':
        setState((prev) => ({
          ...prev,
          polls: [...prev.polls, data.poll],
        }))
        break

      case 'poll_voted':
        setState((prev) => ({
          ...prev,
          polls: prev.polls.map((poll) => {
            if (poll.poll_id !== data.poll_id) return poll
            return {
              ...poll,
              options: poll.options.map((opt) => {
                if (opt.id !== data.option_id) return opt
                return {
                  ...opt,
                  votes: [...opt.votes, data.vote],
                }
              }),
            }
          }),
        }))
        break

      case 'poll_closed':
        setState((prev) => ({
          ...prev,
          polls: prev.polls.map((poll) =>
            poll.poll_id === data.poll_id
              ? { ...poll, status: 'closed' as const }
              : poll
          ),
        }))
        break

      case 'room_updated':
        setState((prev) => ({
          ...prev,
          room: prev.room
            ? { ...prev.room, ...data.room }
            : data.room,
        }))
        break

      case 'error':
        setState((prev) => ({ ...prev, error: data.error }))
        break

      case 'pong':
        // Keepalive acknowledged
        break
    }
  }, [])

  const sendMessage = useCallback(
    (content: string, mentions: string[] = [], reply_to?: string) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
      const msg: any = { type: 'message', content, mentions }
      if (reply_to) msg.reply_to = reply_to
      wsRef.current.send(JSON.stringify(msg))
    },
    []
  )

  const loadHistory = useCallback(async () => {
    // Don't load if already loading or no more history
    if (state.isLoadingHistory || !state.hasMoreHistory) return

    setState((prev) => ({ ...prev, isLoadingHistory: true }))

    try {
      const params = new URLSearchParams({ limit: '30' })
      if (state.historyCursor) {
        params.set('cursor', state.historyCursor)
      }

      const res = await fetch(`${getApiBase()}/api/rooms/${roomId}/history?${params}`)
      if (!res.ok) {
        throw new Error('Failed to load history')
      }

      const data = await res.json()
      const olderMessages: ChatMessage[] = (data.messages || []).map((m: any) => ({
        id: m.id,
        sender: m.sender,
        content: stripSenderPrefix(m.content, m.sender?.name || ''),
        reply_to: m.reply_to,
        timestamp: m.timestamp,
        poll_id: m.poll_id,
      }))

      setState((prev) => {
        // Deduplicate: filter out messages that already exist
        const existingIds = new Set(prev.messages.map((m) => m.id))
        const newMessages = olderMessages.filter((m) => !existingIds.has(m.id))

        return {
          ...prev,
          // Prepend older messages (they come in chronological order from API)
          messages: [...newMessages, ...prev.messages],
          historyCursor: data.next_cursor,
          hasMoreHistory: data.next_cursor !== null,
          isLoadingHistory: false,
        }
      })
    } catch (err) {
      console.error('Failed to load history:', err)
      setState((prev) => ({ ...prev, isLoadingHistory: false }))
    }
  }, [roomId, state.isLoadingHistory, state.hasMoreHistory, state.historyCursor])

  const sendTyping = useCallback((is_typing: boolean) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    wsRef.current.send(JSON.stringify({ type: 'typing', is_typing }))
  }, [])

  const interruptLLM = useCallback(
    (llm_id: string, message_id?: string) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
      const msg: any = { type: 'interrupt', llm_id }
      if (message_id) msg.message_id = message_id
      wsRef.current.send(JSON.stringify(msg))
    },
    []
  )

  const addLLM = useCallback(
    (llm: { id: string; model: string; persona: string; display_name: string; title?: string; avatar?: string }) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
      wsRef.current.send(JSON.stringify({ type: 'add_llm', llm }))
    },
    []
  )

  const updateLLM = useCallback(
    (update: { llm_id: string; model?: string; persona?: string; display_name?: string; title?: string; chat_style?: number; avatar?: string }) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
      wsRef.current.send(JSON.stringify({ type: 'update_llm', ...update }))
    },
    []
  )

  const removeLLM = useCallback((llm_id: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    wsRef.current.send(JSON.stringify({ type: 'remove_llm', llm_id }))
  }, [])

  const createPoll = useCallback(
    (poll: { question: string; options: { text: string; description?: string }[]; allow_multiple?: boolean; anonymous?: boolean; mandatory?: boolean }) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
      wsRef.current.send(JSON.stringify({ type: 'create_poll', ...poll }))
    },
    []
  )

  const castVote = useCallback(
    (poll_id: string, option_ids: string[], reason?: string) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
      wsRef.current.send(JSON.stringify({ type: 'cast_vote', poll_id, option_ids, reason: reason || '' }))
    },
    []
  )

  const closePoll = useCallback((poll_id: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    wsRef.current.send(JSON.stringify({ type: 'close_poll', poll_id }))
  }, [])

  const updateRoomDescription = useCallback((description: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    wsRef.current.send(JSON.stringify({ type: 'update_room_description', description }))
  }, [])

  const disconnect = useCallback(() => {
    // Clear reconnection state
    connectionParamsRef.current = null
    intentionalCloseRef.current = true

    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }

    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }

    setState((prev) => ({
      ...prev,
      isConnected: false,
      isReconnecting: false,
      reconnectAttempt: 0,
    }))
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      intentionalCloseRef.current = true
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
      }
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [])

  return {
    ...state,
    connect,
    disconnect,
    sendMessage,
    sendTyping,
    interruptLLM,
    addLLM,
    updateLLM,
    removeLLM,
    createPoll,
    castVote,
    closePoll,
    loadHistory,
    updateRoomDescription,
  }
}
