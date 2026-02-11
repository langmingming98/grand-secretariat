'use client'

import { useState, memo, useCallback } from 'react'
import { modelIdToDisplayName, modelIdToShortId } from '../../lib/utils'
import { ModelPicker } from './ModelPicker'
import type { LLMInfo, OpenRouterModel } from './types'

interface AddLLMFormProps {
  existingLLMs: LLMInfo[]
  onAdd: (llm: {
    id: string
    model: string
    persona: string
    display_name: string
    title?: string
  }) => void
  onCancel: () => void
}

function AddLLMFormInner({ existingLLMs, onAdd, onCancel }: AddLLMFormProps) {
  const [model, setModel] = useState('')
  const [name, setName] = useState('')
  const [persona, setPersona] = useState('')
  const [title, setTitle] = useState('')

  const handleSubmit = useCallback(() => {
    if (!model.trim() || !name.trim()) return

    const baseId = modelIdToShortId(model.trim())
    let shortId = baseId
    let suffix = 2
    const existingIds = new Set(existingLLMs.map((l) => l.id))
    while (existingIds.has(shortId)) {
      shortId = `${baseId}-${suffix}`
      suffix += 1
    }

    onAdd({
      id: shortId,
      model: model.trim(),
      display_name: name.trim(),
      persona: persona.trim() || `You are ${name.trim()}, a helpful AI assistant.`,
      title: title.trim() || undefined,
    })
  }, [model, name, persona, title, existingLLMs, onAdd])

  const handleModelSelect = useCallback(
    (m: OpenRouterModel) => {
      setModel(m.id)
      if (!name.trim()) {
        setName(m.name || modelIdToDisplayName(m.id))
      }
    },
    [name]
  )

  return (
    <div className="mb-3 p-2 bg-canvas-100 rounded-sm border border-canvas-300">
      <div className="space-y-2">
        <ModelPicker
          selectedModel={model || null}
          onSelect={handleModelSelect}
          placeholder="Search model..."
          showSelectedChip={true}
          excludeModels={existingLLMs.map((l) => l.model)}
        />

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Display name"
          className="w-full px-2 py-1.5 bg-white border-0 border-b border-canvas-300 text-xs text-ink-900 placeholder-ink-400 focus:outline-none focus:border-ink-500"
        />

        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title (optional)"
          className="w-full px-2 py-1.5 bg-white border-0 border-b border-canvas-300 text-xs text-ink-900 placeholder-ink-400 focus:outline-none focus:border-ink-500"
        />

        <textarea
          value={persona}
          onChange={(e) => setPersona(e.target.value)}
          placeholder="Persona (optional)"
          rows={2}
          className="w-full px-2 py-1.5 bg-white border border-canvas-300 rounded-sm text-xs text-ink-900 placeholder-ink-400 focus:outline-none focus:border-ink-500 resize-none"
        />
      </div>

      <div className="flex gap-2 mt-3">
        <button
          onClick={handleSubmit}
          disabled={!model.trim() || !name.trim()}
          className="flex-1 py-1.5 bg-ink-800 hover:bg-ink-700 disabled:opacity-50 rounded-sm text-xs text-white font-medium"
        >
          Add
        </button>
        <button
          onClick={onCancel}
          className="py-1.5 px-3 text-xs text-ink-500 hover:text-ink-800"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

export const AddLLMForm = memo(AddLLMFormInner)
