'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { getWsUrl } from '../lib/api'
import { stripSenderPrefix } from '../lib/utils'

// ---- Types ----

export interface Participant {
  id: string
  name: string
  role: number
  type: number // 1=human, 2=llm
  title?: string
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
}

export interface RoomInfo {
  id: string
  name: string
  description?: string
  created_at: string | null
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
}

// ---- Hook ----

export function useRoomSocket(roomId: string) {
  const wsRef = useRef<WebSocket | null>(null)
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
  })

  const connect = useCallback(
    (userId: string, displayName: string, role: string = 'member', title: string = '') => {
      if (wsRef.current) {
        wsRef.current.close()
      }

      const wsUrl = getWsUrl(`/ws/room/${roomId}`)
      const ws = new WebSocket(wsUrl)

      ws.onopen = () => {
        setState((prev) => ({ ...prev, isConnected: true, wasConnected: true, error: null }))
        // Send join message
        ws.send(
          JSON.stringify({
            type: 'join',
            user_id: userId,
            name: displayName,
            role,
            title,
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
        setState((prev) => ({
          ...prev,
          isConnected: false,
          error: 'WebSocket connection error',
        }))
      }

      ws.onclose = () => {
        setState((prev) => ({ ...prev, isConnected: false }))
      }

      wsRef.current = ws
    },
    [roomId]
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
        setState((prev) => ({
          ...prev,
          messages: [
            ...prev.messages,
            {
              ...(data as ChatMessage),
              content: stripSenderPrefix(data.content, data.sender?.name || ''),
            },
          ],
        }))
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
          participants: prev.participants.filter(
            (p) => p.id !== data.user_id
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
    (llm: { id: string; model: string; persona: string; display_name: string; title?: string }) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
      wsRef.current.send(JSON.stringify({ type: 'add_llm', llm }))
    },
    []
  )

  const updateLLM = useCallback(
    (update: { llm_id: string; model?: string; persona?: string; display_name?: string; title?: string }) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
      wsRef.current.send(JSON.stringify({ type: 'update_llm', ...update }))
    },
    []
  )

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

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
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
    createPoll,
    castVote,
    closePoll,
  }
}
