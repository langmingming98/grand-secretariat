'use client'

import { useState, useEffect, useRef, useCallback, memo } from 'react'
import { getApiBase } from '../../lib/api'
import { modelIdToDisplayName } from '../../lib/utils'
import type { OpenRouterModel } from './types'

interface ModelPickerProps {
  /** Current selected model ID (null if none) */
  selectedModel: string | null
  /** Called when user selects a model */
  onSelect: (model: OpenRouterModel) => void
  /** Called when user cancels (optional) */
  onCancel?: () => void
  /** Placeholder text for search input */
  placeholder?: string
  /** Maximum results to show */
  maxResults?: number
  /** Debounce delay in ms */
  debounceMs?: number
  /** Auto-focus the search input */
  autoFocus?: boolean
  /** Optional list of model IDs to exclude from results (e.g., already added) */
  excludeModels?: string[]
  /** Show the selected model as a chip that can be cleared */
  showSelectedChip?: boolean
  /** Additional class names for the container */
  className?: string
}

function ModelPickerInner({
  selectedModel,
  onSelect,
  onCancel,
  placeholder = 'Search models...',
  maxResults = 10,
  debounceMs = 250,
  autoFocus = false,
  excludeModels = [],
  showSelectedChip = true,
  className = '',
}: ModelPickerProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [results, setResults] = useState<OpenRouterModel[]>([])
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<NodeJS.Timeout | null>(null)

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const params = searchQuery ? `?q=${encodeURIComponent(searchQuery)}` : ''
        const res = await fetch(`${getApiBase()}/api/models${params}`)
        const data = await res.json()
        setResults(data.models || [])
      } catch (err) {
        console.error('Failed to fetch models:', err)
        setResults([])
      } finally {
        setLoading(false)
      }
    }, debounceMs)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [searchQuery, debounceMs])

  const handleClear = useCallback(() => {
    setSearchQuery('')
  }, [])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        onCancel?.()
      }
    },
    [onCancel]
  )

  // Filter out excluded models
  const filteredResults = results.filter((m) => !excludeModels.includes(m.id))

  return (
    <div className={`relative ${className}`}>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          onKeyDown={handleKeyDown}
          className="flex-1 px-3 py-2 bg-white border border-canvas-400 rounded-sm text-sm text-ink-900 placeholder-ink-400 focus:outline-none focus:border-ink-500"
        />
        {onCancel && (
          <button
            onClick={onCancel}
            className="px-3 py-2 text-sm text-ink-500 hover:text-ink-900 hover:bg-canvas-200 rounded-sm transition-colors"
          >
            Cancel
          </button>
        )}
      </div>

      {/* Selected model chip */}
      {showSelectedChip && selectedModel && (
        <div className="mt-1 px-2 py-1 bg-canvas-200 border border-canvas-400 rounded-sm text-xs text-ink-800 flex items-center justify-between">
          <span className="truncate">{selectedModel}</span>
          <button
            onClick={handleClear}
            className="ml-1 text-ink-500 hover:text-ink-700 flex-shrink-0"
            title="Clear selection"
          >
            &times;
          </button>
        </div>
      )}

      {/* Results dropdown */}
      {searchQuery && !selectedModel && (
        <div className="mt-1 max-h-32 overflow-y-auto border border-canvas-300 rounded-sm bg-white z-10">
          {loading ? (
            <div className="px-2 py-1 text-xs text-ink-500">Loading...</div>
          ) : filteredResults.length === 0 ? (
            <div className="px-2 py-1 text-xs text-ink-500">
              {results.length > 0 ? 'All matching models already added' : 'No models found'}
            </div>
          ) : (
            filteredResults.slice(0, maxResults).map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  onSelect(m)
                  setSearchQuery('')
                }}
                className="w-full text-left px-2 py-1.5 text-xs text-ink-900 hover:bg-canvas-200 transition-colors border-b border-canvas-200 last:border-b-0"
              >
                <div className="font-medium truncate">{m.name || modelIdToDisplayName(m.id)}</div>
                <div className="text-ink-500 truncate">{m.id}</div>
              </button>
            ))
          )}
        </div>
      )}

    </div>
  )
}

export const ModelPicker = memo(ModelPickerInner)
