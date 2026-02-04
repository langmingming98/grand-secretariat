'use client'

import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface ModelPanelProps {
  modelName: string
  content: string
  isComplete: boolean
  error?: string
  tokenCount?: number
}

export default function ModelPanel({ 
  modelName, 
  content, 
  isComplete, 
  error,
  tokenCount 
}: ModelPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when content updates
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [content])

  return (
    <div className="border border-blue-500 rounded-lg p-4 h-full flex flex-col bg-gray-800">
      <div className="font-semibold text-lg mb-2 text-blue-400 border-b border-blue-500 pb-2">
        {modelName}
      </div>
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto prose prose-invert prose-sm max-w-none"
      >
        {error ? (
          <div className="text-red-400">ERROR: {error}</div>
        ) : (
          <>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {content || ''}
            </ReactMarkdown>
            {tokenCount !== undefined && (
              <div className="mt-4 pt-4 border-t border-gray-600">
                <div className="text-gray-400">
                  Congrats you used {tokenCount} tokens!
                </div>
              </div>
            )}
            {!isComplete && (
              <span className="inline-block w-2 h-4 bg-blue-400 ml-1 animate-pulse" />
            )}
          </>
        )}
      </div>
    </div>
  )
}

