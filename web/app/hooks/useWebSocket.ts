'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

interface WebSocketMessage {
  type: 'content' | 'usage' | 'done' | 'error'
  model?: string
  content?: string
  completion_tokens?: number
  error?: string
}

interface ModelState {
  content: string
  isComplete: boolean
  error?: string
  tokenCount?: number
}

export function useWebSocket(models: string[]) {
  const wsRef = useRef<WebSocket | null>(null)
  const [modelStates, setModelStates] = useState<Record<string, ModelState>>(
    models.reduce((acc, model) => {
      acc[model] = { content: '', isComplete: false }
      return acc
    }, {} as Record<string, ModelState>)
  )
  const [isConnected, setIsConnected] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)

  const connect = useCallback((messages: Array<{ role: string; content: string }>) => {
    // Close existing connection if any
    if (wsRef.current) {
      wsRef.current.close()
    }

    // Reset states
    setModelStates(
      models.reduce((acc, model) => {
        acc[model] = { content: '', isComplete: false }
        return acc
      }, {} as Record<string, ModelState>)
    )
    setIsStreaming(true)

    // Connect to WebSocket
    // - Production (HTTPS): wss:// through nginx on same host
    // - Local dev (HTTP on :3000): ws:// directly to gateway on :8000
    let wsUrl: string
    if (typeof window !== 'undefined') {
      const isLocalDev = window.location.hostname === 'localhost' && window.location.port === '3000'
      if (isLocalDev) {
        wsUrl = 'ws://localhost:8000/ws/chat/stream'
      } else {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        wsUrl = `${protocol}//${window.location.host}/ws/chat/stream`
      }
    } else {
      wsUrl = 'ws://localhost:8000/ws/chat/stream'
    }
    const ws = new WebSocket(wsUrl)

    ws.onopen = () => {
      setIsConnected(true)
      // Send initial message with models and messages
      ws.send(JSON.stringify({
        models,
        messages,
      }))
    }

    ws.onmessage = (event) => {
      try {
        const data: WebSocketMessage = JSON.parse(event.data)
        
        if (data.type === 'error' && !data.model) {
          // Global error
          console.error('WebSocket error:', data.error)
          setIsStreaming(false)
          return
        }

        if (!data.model) return

        setModelStates((prev) => {
          const current = prev[data.model!] || { content: '', isComplete: false }
          const newState = { ...prev }
          
          switch (data.type) {
            case 'content':
              newState[data.model!] = {
                ...current,
                content: current.content + (data.content || ''),
              }
              break
            case 'usage':
              newState[data.model!] = {
                ...current,
                tokenCount: data.completion_tokens,
              }
              break
            case 'done':
              newState[data.model!] = {
                ...current,
                isComplete: true,
              }
              break
            case 'error':
              newState[data.model!] = {
                ...current,
                error: data.error,
                isComplete: true,
              }
              break
            default:
              return prev
          }
          
          // Check if all models are complete
          const allComplete = Object.values(newState).every(
            (state) => state.isComplete || state.error
          )
          if (allComplete) {
            setIsStreaming(false)
          }
          
          return newState
        })
      } catch (error) {
        console.error('Error parsing WebSocket message:', error)
      }
    }

    ws.onerror = (error) => {
      console.error('WebSocket error:', error)
      setIsConnected(false)
      setIsStreaming(false)
    }

    ws.onclose = () => {
      setIsConnected(false)
      setIsStreaming(false)
    }

    wsRef.current = ws
  }, [models])

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    setIsConnected(false)
    setIsStreaming(false)
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
    modelStates,
    isConnected,
    isStreaming,
    connect,
    disconnect,
  }
}

