'use client'

import { useState, memo, useCallback, useEffect } from 'react'
import { modelIdToDisplayName } from '../../lib/utils'
import { ModelPicker } from './ModelPicker'
import type { LLMInfo, OpenRouterModel, ChatStyleId } from './types'
import { PERSONA_PRESETS, CHAT_STYLES } from './types'

interface EditLLMFormProps {
  llm: LLMInfo
  llmName: string
  onSave: (update: {
    llm_id: string
    model?: string
    persona?: string
    title?: string
    chat_style?: number
  }) => void
  onCancel: () => void
}

function EditLLMFormInner({ llm, llmName, onSave, onCancel }: EditLLMFormProps) {
  const [model, setModel] = useState(llm.model)
  const [persona, setPersona] = useState(llm.persona || '')
  const [title, setTitle] = useState(llm.title || '')
  const [chatStyle, setChatStyle] = useState<ChatStyleId>((llm.chat_style || 0) as ChatStyleId)

  // Reset form when llm changes
  useEffect(() => {
    setModel(llm.model)
    setPersona(llm.persona || '')
    setTitle(llm.title || '')
    setChatStyle((llm.chat_style || 0) as ChatStyleId)
  }, [llm])

  const handleSubmit = useCallback(() => {
    const updates: {
      llm_id: string
      model?: string
      persona?: string
      title?: string
      chat_style?: number
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
    if (chatStyle !== (llm.chat_style || 0)) {
      updates.chat_style = chatStyle
    }

    onSave(updates)
  }, [llm, model, persona, title, chatStyle, onSave])

  const handleModelSelect = useCallback((m: OpenRouterModel) => {
    setModel(m.id)
  }, [])

  const handleResetModel = useCallback(() => {
    setModel(llm.model)
  }, [llm.model])

  return (
    <div className="mt-1.5 ml-4 p-2 bg-white rounded border border-slate-300 space-y-1.5">
      {/* Model search */}
      <div className="relative">
        <ModelPicker
          selectedModel={model}
          onSelect={handleModelSelect}
          placeholder="Search model..."
          showSelectedChip={false}
        />
        {model && (
          <div className="mt-1 px-2 py-1 bg-blue-50 border border-blue-200 rounded text-xs text-blue-800 flex items-center justify-between">
            <span className="truncate">{model}</span>
            <button
              onClick={handleResetModel}
              className="ml-1 text-blue-500 hover:text-blue-700 flex-shrink-0 text-[10px]"
            >
              reset
            </button>
          </div>
        )}
      </div>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title"
        className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs text-slate-900 placeholder-slate-500 focus:outline-none focus:border-blue-500"
      />

      {/* Chat style selector */}
      <div>
        <label className="text-[10px] text-slate-500 block mb-1">Response Style</label>
        <div className="flex flex-wrap gap-1">
          {CHAT_STYLES.map((style) => (
            <button
              key={style.id}
              type="button"
              onClick={() => setChatStyle(style.id as ChatStyleId)}
              className={`px-1.5 py-0.5 text-[10px] rounded border transition-colors ${
                chatStyle === style.id
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-slate-200 hover:border-blue-400 hover:bg-blue-50 text-slate-600'
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
            onClick={() => setPersona(preset.template.replace('{name}', llmName))}
            className="px-1.5 py-0.5 text-[10px] rounded border border-slate-200 hover:border-blue-400 hover:bg-blue-50 transition-colors text-slate-600"
          >
            {preset.label}
          </button>
        ))}
      </div>

      <textarea
        value={persona}
        onChange={(e) => setPersona(e.target.value)}
        placeholder="Persona - describe how this LLM should behave"
        rows={4}
        className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs text-slate-900 placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-y min-h-[80px]"
      />

      <div className="flex gap-1">
        <button
          onClick={handleSubmit}
          className="flex-1 px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs text-white"
        >
          Save
        </button>
        <button onClick={onCancel} className="px-2 py-1 text-xs text-slate-500 hover:text-slate-900">
          Cancel
        </button>
      </div>
    </div>
  )
}

export const EditLLMForm = memo(EditLLMFormInner)
