'use client'

import { useState } from 'react'
import ModelPanel from './components/ModelPanel'
import ChatInput from './components/ChatInput'
import { useWebSocket } from './hooks/useWebSocket'

const DEFAULT_MODELS = [
  'openai/gpt-5-mini',
  'anthropic/claude-haiku-4.5',
  'google/gemini-2.5-flash',
  'x-ai/grok-4.1-fast',
]

export default function Home() {
  const [models] = useState(DEFAULT_MODELS)
  const { modelStates, isStreaming, connect, disconnect } = useWebSocket(models)

  const handleSend = (message: string) => {
    connect([{ role: 'user', content: message }])
  }

  const handleRestart = () => {
    disconnect()
  }

  return (
    <div className="min-h-screen flex flex-col p-4 gap-4">
      <header className="text-2xl font-bold text-center text-blue-400 mb-2">
        Claude Took Over Human
      </header>
      
      <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-4 min-h-0">
        {models.map((model) => (
          <ModelPanel
            key={model}
            modelName={model}
            content={modelStates[model]?.content || ''}
            isComplete={modelStates[model]?.isComplete || false}
            error={modelStates[model]?.error}
            tokenCount={modelStates[model]?.tokenCount}
          />
        ))}
      </div>

      <div className="flex gap-2 items-center">
        <div className="flex-1">
          <ChatInput onSend={handleSend} disabled={isStreaming} />
        </div>
        {isStreaming && (
          <button
            onClick={handleRestart}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            Stop
          </button>
        )}
      </div>
    </div>
  )
}

