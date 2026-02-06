'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

// ---- Types ----

export interface Participant {
  id: string
  name: string
  role: number
  type: number // 1=human, 2=llm
}

export interface ChatMessage {
  id: string
  sender: { id: string; name: string; type: 'human' | 'llm' }
  content: string
  reply_to?: string
  timestamp: number
}

export interface LLMInfo {
  id: string
  model: string
  display_name: string
}

export interface RoomInfo {
  id: string
  name: string
  created_at: string | null
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
  streamingLLMs: Record<string, StreamingLLM>
  typingUsers: TypingUser[]
  error: string | null
  isConnected: boolean
}

// ---- Hook ----

export function useRoomSocket(roomId: string) {
  const wsRef = useRef<WebSocket | null>(null)
  const [state, setState] = useState<RoomState>({
    room: null,
    participants: [],
    messages: [],
    llms: [],
    streamingLLMs: {},
    typingUsers: [],
    error: null,
    isConnected: false,
  })

  const connect = useCallback(
    (userId: string, displayName: string, role: string = 'member') => {
      if (wsRef.current) {
        wsRef.current.close()
      }

      let wsUrl: string
      if (typeof window !== 'undefined') {
        const isLocalDev =
          window.location.hostname === 'localhost' &&
          window.location.port === '3000'
        if (isLocalDev) {
          wsUrl = `ws://localhost:8000/ws/room/${roomId}`
        } else {
          const protocol =
            window.location.protocol === 'https:' ? 'wss:' : 'ws:'
          wsUrl = `${protocol}//${window.location.host}/ws/room/${roomId}`
        }
      } else {
        wsUrl = `ws://localhost:8000/ws/room/${roomId}`
      }

      const ws = new WebSocket(wsUrl)

      ws.onopen = () => {
        setState((prev) => ({ ...prev, isConnected: true, error: null }))
        // Send join message
        ws.send(
          JSON.stringify({
            type: 'join',
            user_id: userId,
            name: displayName,
            role,
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
          messages: data.messages || [],
          llms: data.llms || [],
        }))
        break

      case 'message':
        setState((prev) => ({
          ...prev,
          messages: [...prev.messages, data as ChatMessage],
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
              ? prev.participants
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
                reply_to: data.reply_to,
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
            content: streaming.content,
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
  }
}
