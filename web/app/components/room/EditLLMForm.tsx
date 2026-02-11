'use client'

import { useState, memo, useCallback, useEffect } from 'react'
import { ModelPicker } from './ModelPicker'
import type { LLMInfo, OpenRouterModel } from './types'

interface EditLLMFormProps {
  llm: LLMInfo
  llmName: string
  onSave: (update: {
    llm_id: string
    model?: string
    persona?: string
    title?: string
  }) => void
  onCancel: () => void
}

function EditLLMFormInner({ llm, llmName, onSave, onCancel }: EditLLMFormProps) {
  const [model, setModel] = useState(llm.model)
  const [persona, setPersona] = useState(llm.persona || '')
  const [title, setTitle] = useState(llm.title || '')

  // Reset form when llm changes
  useEffect(() => {
    setModel(llm.model)
    setPersona(llm.persona || '')
    setTitle(llm.title || '')
  }, [llm])

  const handleSubmit = useCallback(() => {
    const updates: {
      llm_id: string
      model?: string
      persona?: string
      title?: string
    } = { llm_id: llm.id }

    if (model.trim() && model.trim() !== llm.model) {
      updates.model = model.trim()
    }
    if (persona.trim() !== (llm.persona || '')) {
      updates.persona = persona.trim()
    }
    if (title.trim() !== (llm.title || '')) {
      updates.title = title.trim()
    }

    onSave(updates)
  }, [llm, model, persona, title, onSave])

  const handleModelSelect = useCallback((m: OpenRouterModel) => {
    setModel(m.id)
  }, [])

  return (
    <div className="mt-2 ml-4 p-2 bg-canvas-100 rounded-sm border border-canvas-300">
      <div className="space-y-2">
        <ModelPicker
          selectedModel={model}
          onSelect={handleModelSelect}
          placeholder="Search model..."
          showSelectedChip={true}
        />

        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          className="w-full px-2 py-1.5 bg-white border-0 border-b border-canvas-300 text-xs text-ink-900 placeholder-ink-400 focus:outline-none focus:border-ink-500"
        />

        <textarea
          value={persona}
          onChange={(e) => setPersona(e.target.value)}
          placeholder="Persona"
          rows={3}
          className="w-full px-2 py-1.5 bg-white border border-canvas-300 rounded-sm text-xs text-ink-900 placeholder-ink-400 focus:outline-none focus:border-ink-500 resize-none"
        />
      </div>

      <div className="flex gap-2 mt-3">
        <button
          onClick={handleSubmit}
          className="flex-1 py-1.5 bg-ink-800 hover:bg-ink-700 rounded-sm text-xs text-white font-medium"
        >
          Save
        </button>
        <button
          onClick={onCancel}
          className="py-1.5 px-3 text-xs text-ink-500 hover:text-ink-900"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

export const EditLLMForm = memo(EditLLMFormInner)
