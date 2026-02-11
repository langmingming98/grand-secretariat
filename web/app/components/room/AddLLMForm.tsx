'use client'

import { useState, memo, useCallback } from 'react'
import { modelIdToDisplayName, modelIdToShortId } from '../../lib/utils'
import { ModelPicker } from './ModelPicker'
import type { LLMInfo, OpenRouterModel, ChatStyleId } from './types'
import { PERSONA_PRESETS, CHAT_STYLES } from './types'

interface AddLLMFormProps {
  existingLLMs: LLMInfo[]
  onAdd: (llm: {
    id: string
    model: string
    persona: string
    display_name: string
    title?: string
    chat_style?: number
  }) => void
  onCancel: () => void
}

function AddLLMFormInner({ existingLLMs, onAdd, onCancel }: AddLLMFormProps) {
  const [model, setModel] = useState('')
  const [name, setName] = useState('')
  const [persona, setPersona] = useState('')
  const [title, setTitle] = useState('')
  const [chatStyle, setChatStyle] = useState<ChatStyleId>(1)  // Default to conversational (Slack mode)

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
      chat_style: chatStyle,
    })
  }, [model, name, persona, title, chatStyle, existingLLMs, onAdd])

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
    <div className="mb-3 p-2 bg-white rounded border border-gray-300 space-y-1.5">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Display name"
        className="w-full px-2 py-1 bg-white border border-gray-300 rounded text-xs text-gray-900 placeholder-gray-500 focus:outline-none focus:border-blue-500"
      />

      <ModelPicker
        selectedModel={model || null}
        onSelect={handleModelSelect}
        placeholder="Search model..."
        showSelectedChip={true}
        excludeModels={existingLLMs.map((l) => l.model)}
      />

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title (optional)"
        className="w-full px-2 py-1 bg-white border border-gray-300 rounded text-xs text-gray-900 placeholder-gray-500 focus:outline-none focus:border-blue-500"
      />

      {/* Chat style selector */}
      <div>
        <label className="text-[10px] text-gray-500 block mb-1">Response Style</label>
        <div className="flex flex-wrap gap-1">
          {CHAT_STYLES.map((style) => (
            <button
              key={style.id}
              type="button"
              onClick={() => setChatStyle(style.id as ChatStyleId)}
              className={`px-1.5 py-0.5 text-[10px] rounded border transition-colors ${
                chatStyle === style.id
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 hover:border-blue-400 hover:bg-blue-50 text-gray-600'
              }`}
              title={style.description}
            >
              {style.label}
            </button>
          ))}
        </div>
      </div>

      {/* Persona presets */}
      <div className="flex flex-wrap gap-1">
        {PERSONA_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => setPersona(preset.template.replace('{name}', name || 'Assistant'))}
            className="px-1.5 py-0.5 text-[10px] rounded border border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-colors text-gray-600"
          >
            {preset.label}
          </button>
        ))}
      </div>

      <textarea
        value={persona}
        onChange={(e) => setPersona(e.target.value)}
        placeholder="Persona (optional) - describe how this LLM should behave"
        rows={4}
        className="w-full px-2 py-1 bg-white border border-gray-300 rounded text-xs text-gray-900 placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-y min-h-[80px]"
      />

      <div className="flex gap-1">
        <button
          onClick={handleSubmit}
          disabled={!model.trim() || !name.trim()}
          className="flex-1 px-2 py-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded text-xs text-white"
        >
          Add
        </button>
        <button onClick={onCancel} className="px-2 py-1 text-xs text-gray-500 hover:text-gray-800">
          Cancel
        </button>
      </div>
    </div>
  )
}

export const AddLLMForm = memo(AddLLMFormInner)
