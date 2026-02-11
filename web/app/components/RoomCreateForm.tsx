'use client'

import { useState, useCallback, useMemo, memo } from 'react'
import { modelIdToDisplayName, modelIdToShortId } from '../lib/utils'
import { getApiBase } from '../lib/api'
import { ModelPicker } from './room/ModelPicker'
import type { OpenRouterModel } from './room/types'

// Persona presets for LLMs
interface PersonaPreset {
  id: string
  label: string
  template: string
}

const PERSONA_PRESETS: PersonaPreset[] = [
  {
    id: 'default',
    label: 'Default Assistant',
    template: 'You are {name}, a helpful AI assistant. Be concise and direct.',
  },
  {
    id: 'expert',
    label: 'Domain Expert',
    template:
      'You are {name}, a senior expert with deep knowledge. Provide thorough, well-reasoned responses with examples when helpful.',
  },
  {
    id: 'creative',
    label: 'Creative Thinker',
    template:
      'You are {name}, a creative problem solver. Think outside the box, propose unconventional ideas, and challenge assumptions.',
  },
  {
    id: 'critic',
    label: "Devil's Advocate",
    template:
      'You are {name}, a critical thinker. Question assumptions, identify potential issues, and stress-test ideas before agreeing.',
  },
  {
    id: 'concise',
    label: 'Concise Responder',
    template:
      'You are {name}. Be extremely brief - use bullet points, short sentences, no fluff. Get to the point immediately.',
  },
]

export interface LLMEntry {
  id: string
  model: string
  persona: string
  display_name: string
  title?: string
}

interface RoomPreset {
  id: string
  name: string
  description: string
  llms: LLMEntry[]
}

interface RoomCreateFormProps {
  onSubmit: (data: {
    name: string
    description: string
    llms: LLMEntry[]
    visibility: 'public' | 'private'
  }) => void
  onCancel?: () => void
  defaultLLMs?: LLMEntry[]
  presets: RoomPreset[]
  defaultDescription?: string
}

function RoomCreateFormInner({
  onSubmit,
  onCancel,
  defaultLLMs = [],
  presets,
  defaultDescription = '',
}: RoomCreateFormProps) {
  const [roomName, setRoomName] = useState('')
  const [roomDescription, setRoomDescription] = useState(defaultDescription)
  const [selectedModels, setSelectedModels] = useState<LLMEntry[]>([...defaultLLMs])
  const [expandedLLM, setExpandedLLM] = useState<string | null>(null)
  const [showModelPicker, setShowModelPicker] = useState(false)
  const [visibility, setVisibility] = useState<'public' | 'private'>('public')

  // AI generation state
  const [aiPrompt, setAiPrompt] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)

  const canSubmit = useMemo(
    () => roomName.trim().length > 0 && selectedModels.length > 0,
    [roomName, selectedModels]
  )

  const handleSubmit = useCallback(() => {
    if (!canSubmit) return
    onSubmit({
      name: roomName.trim(),
      description: roomDescription.trim(),
      llms: selectedModels,
      visibility,
    })
  }, [canSubmit, roomName, roomDescription, selectedModels, visibility, onSubmit])

  const removeModel = useCallback((id: string) => {
    setSelectedModels((prev) => prev.filter((m) => m.id !== id))
  }, [])

  const applyRoomPreset = useCallback((preset: RoomPreset) => {
    setRoomName(preset.name)
    setRoomDescription(preset.description)
    setSelectedModels([...preset.llms])
  }, [])

  const addModel = useCallback((model: OpenRouterModel) => {
    const shortId = modelIdToShortId(model.id)
    setSelectedModels((prev) => {
      if (prev.some((m) => m.model === model.id)) return prev
      return [
        ...prev,
        {
          id: shortId,
          model: model.id,
          display_name: model.name || modelIdToDisplayName(model.id),
          persona: `You are ${model.name || modelIdToDisplayName(model.id)}, a helpful AI assistant. Be concise.`,
        },
      ]
    })
    setShowModelPicker(false)
    setExpandedLLM(shortId)  // Auto-expand persona section for new model
  }, [])

  const updateModelField = useCallback(
    (id: string, field: keyof LLMEntry, value: string) => {
      setSelectedModels((prev) =>
        prev.map((m) => (m.id === id ? { ...m, [field]: value } : m))
      )
    },
    []
  )

  const existingModelIds = useMemo(
    () => selectedModels.map((m) => m.model),
    [selectedModels]
  )

  const handleGenerate = useCallback(async () => {
    if (!aiPrompt.trim() || isGenerating) return

    setIsGenerating(true)
    setGenerateError(null)

    try {
      const res = await fetch(`${getApiBase()}/api/rooms/generate-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: aiPrompt.trim() }),
      })

      if (!res.ok) {
        const error = await res.json().catch(() => ({ detail: 'Generation failed' }))
        throw new Error(error.detail || 'Generation failed')
      }

      const config = await res.json()

      // Apply generated config to form
      setRoomName(config.name || '')
      setRoomDescription(config.description || '')
      setSelectedModels(
        (config.llms || []).map((llm: { id: string; model: string; display_name: string; persona: string; title?: string }) => ({
          id: llm.id,
          model: llm.model,
          display_name: llm.display_name,
          persona: llm.persona,
          title: llm.title || '',
        }))
      )

      // Clear the prompt after successful generation
      setAiPrompt('')
    } catch (err) {
      console.error('Failed to generate room config:', err)
      setGenerateError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setIsGenerating(false)
    }
  }, [aiPrompt, isGenerating])

  return (
    <div className="mb-8 p-4 bg-white rounded-lg border border-slate-200 shadow-sm">
      <h2 className="text-lg font-medium mb-3">Create Room</h2>

      {/* AI Generation */}
      <div className="mb-4 p-3 bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg border border-purple-200">
        <div className="flex items-center gap-2 mb-2">
          <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <span className="text-sm font-medium text-purple-700">AI-Assisted Setup</span>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            placeholder="Describe your room (e.g., 'debate about AI ethics with optimist and critic')"
            className="flex-1 px-3 py-2 bg-white border border-purple-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:border-purple-500 text-sm"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleGenerate()
              }
            }}
            disabled={isGenerating}
          />
          <button
            onClick={handleGenerate}
            disabled={!aiPrompt.trim() || isGenerating}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:hover:bg-purple-600 rounded-lg text-sm font-medium text-white transition-colors flex items-center gap-2"
          >
            {isGenerating ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Generate
              </>
            )}
          </button>
        </div>
        {generateError && (
          <p className="mt-2 text-xs text-red-600">{generateError}</p>
        )}
      </div>

      {/* Room presets */}
      <div className="mb-4">
        <p className="text-xs text-slate-500 mb-2">Or quick start with a preset:</p>
        <div className="flex flex-wrap gap-2">
          {presets.map((preset) => (
            <button
              key={preset.id}
              onClick={() => applyRoomPreset(preset)}
              className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 hover:border-blue-400 hover:bg-blue-50 transition-colors text-slate-700"
            >
              {preset.name}
            </button>
          ))}
        </div>
      </div>

      <input
        type="text"
        value={roomName}
        onChange={(e) => setRoomName(e.target.value)}
        placeholder="Room name"
        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder-slate-500 focus:outline-none focus:border-blue-500 mb-3"
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSubmit()
        }}
      />

      <textarea
        value={roomDescription}
        onChange={(e) => setRoomDescription(e.target.value)}
        placeholder="Room context (e.g. 'Strategy session for AI product roadmap')"
        rows={2}
        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder-slate-500 focus:outline-none focus:border-blue-500 mb-3 resize-y text-sm"
      />

      {/* Visibility toggle */}
      <div className="flex items-center gap-3 mb-4">
        <span className="text-sm text-slate-600">Visibility:</span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setVisibility('public')}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
              visibility === 'public'
                ? 'border-blue-500 bg-blue-50 text-blue-700'
                : 'border-slate-300 text-slate-600 hover:border-slate-400'
            }`}
          >
            Public
          </button>
          <button
            type="button"
            onClick={() => setVisibility('private')}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors flex items-center gap-1.5 ${
              visibility === 'private'
                ? 'border-blue-500 bg-blue-50 text-blue-700'
                : 'border-slate-300 text-slate-600 hover:border-slate-400'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            Private
          </button>
        </div>
        {visibility === 'private' && (
          <span className="text-xs text-slate-500">Hidden from list, accessible via URL only</span>
        )}
      </div>

      <div className="mb-4">
        <p className="text-sm text-slate-600 mb-2">Models in this room:</p>

        {/* Selected models list */}
        <div className="space-y-2 mb-3">
          {selectedModels.map((llm) => {
            const isExpanded = expandedLLM === llm.id
            return (
              <div key={llm.id} className="rounded-lg border border-blue-200 bg-blue-50">
                <div className="flex items-center justify-between px-3 py-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-sm font-medium text-slate-900 truncate">
                      {llm.display_name}
                    </span>
                    <span className="text-xs text-slate-500 truncate">{llm.model}</span>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => setExpandedLLM(isExpanded ? null : llm.id)}
                      className="text-xs text-slate-500 hover:text-slate-900 px-2"
                    >
                      {isExpanded ? 'Hide' : 'Persona'}
                    </button>
                    <button
                      onClick={() => removeModel(llm.id)}
                      className="text-xs text-red-400 hover:text-red-300 px-1"
                    >
                      Remove
                    </button>
                  </div>
                </div>
                {isExpanded && (
                  <div className="px-3 pb-3 space-y-2">
                    <input
                      type="text"
                      value={llm.title || ''}
                      onChange={(e) => updateModelField(llm.id, 'title', e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                      placeholder="Title (e.g. VP Engineering)"
                    />
                    {/* Persona presets */}
                    <div className="flex flex-wrap gap-1">
                      {PERSONA_PRESETS.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() =>
                            updateModelField(
                              llm.id,
                              'persona',
                              preset.template.replace('{name}', llm.display_name)
                            )
                          }
                          className="px-2 py-0.5 text-xs rounded border border-slate-200 hover:border-blue-400 hover:bg-blue-50 transition-colors text-slate-600"
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                    <textarea
                      value={llm.persona}
                      onChange={(e) => updateModelField(llm.id, 'persona', e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-y"
                      placeholder="System prompt / persona for this model..."
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Add model button / picker */}
        {showModelPicker ? (
          <div className="relative">
            <ModelPicker
              selectedModel={null}
              onSelect={addModel}
              onCancel={() => setShowModelPicker(false)}
              placeholder="Search models (e.g. claude, gpt, gemini, llama)..."
              autoFocus
              excludeModels={existingModelIds}
              showSelectedChip={false}
              debounceMs={300}
            />
          </div>
        ) : (
          <button
            onClick={() => setShowModelPicker(true)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
          >
            + Add Model
          </button>
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 rounded-lg text-sm font-medium text-white transition-colors"
        >
          Create
        </button>
        {onCancel && (
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  )
}

export const RoomCreateForm = memo(RoomCreateFormInner)
