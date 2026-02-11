'use client'

import { useState, memo } from 'react'

interface PollOption {
  text: string
  description: string
}

interface PollCreateModalProps {
  onClose: () => void
  onCreate: (poll: {
    question: string
    options: PollOption[]
    allow_multiple?: boolean
    anonymous?: boolean
    mandatory?: boolean
  }) => void
}

function PollCreateModalInner({ onClose, onCreate }: PollCreateModalProps) {
  const [question, setQuestion] = useState('')
  const [options, setOptions] = useState<PollOption[]>([
    { text: '', description: '' },
    { text: '', description: '' },
  ])
  const [allowMultiple, setAllowMultiple] = useState(false)
  const [mandatory, setMandatory] = useState(true)  // Default to mandatory

  const canCreate = question.trim() && options.filter((o) => o.text.trim()).length >= 2

  const handleAddOption = () => {
    if (options.length < 6) {
      setOptions([...options, { text: '', description: '' }])
    }
  }

  const handleRemoveOption = (index: number) => {
    if (options.length > 2) {
      setOptions(options.filter((_, i) => i !== index))
    }
  }

  const handleOptionChange = (index: number, field: 'text' | 'description', value: string) => {
    setOptions(
      options.map((opt, i) => (i === index ? { ...opt, [field]: value } : opt))
    )
  }

  const handleCreate = () => {
    if (!canCreate) return
    onCreate({
      question: question.trim(),
      options: options.filter((o) => o.text.trim()),
      allow_multiple: allowMultiple,
      mandatory,
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-canvas-100 rounded-sm shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto border border-canvas-300">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-canvas-300 bg-canvas-200">
          <h2 className="text-lg font-display font-semibold text-ink-900">Create Poll</h2>
          <button
            onClick={onClose}
            className="text-ink-400 hover:text-ink-700 text-xl"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          {/* Question */}
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1">
              Question
            </label>
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="What would you like to ask?"
              className="w-full px-3 py-2 border border-canvas-400 rounded-sm focus:outline-none focus:border-ink-500 text-ink-900 bg-white"
              autoFocus
            />
          </div>

          {/* Options */}
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1">
              Options
            </label>
            <div className="space-y-2">
              {options.map((opt, idx) => (
                <div key={idx} className="flex gap-2">
                  <div className="flex-1 space-y-1">
                    <input
                      type="text"
                      value={opt.text}
                      onChange={(e) => handleOptionChange(idx, 'text', e.target.value)}
                      placeholder={`Option ${idx + 1}`}
                      className="w-full px-3 py-2 border border-canvas-400 rounded-sm focus:outline-none focus:border-ink-500 text-sm text-ink-900 bg-white"
                    />
                    <input
                      type="text"
                      value={opt.description}
                      onChange={(e) => handleOptionChange(idx, 'description', e.target.value)}
                      placeholder="Description (optional)"
                      className="w-full px-3 py-1.5 border border-canvas-300 rounded-sm focus:outline-none focus:border-ink-500 text-xs text-ink-600 bg-white"
                    />
                  </div>
                  {options.length > 2 && (
                    <button
                      onClick={() => handleRemoveOption(idx)}
                      className="text-ink-400 hover:text-vermillion-600 self-start mt-2"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
            {options.length < 6 && (
              <button
                onClick={handleAddOption}
                className="mt-2 text-sm text-vermillion-700 hover:text-vermillion-800"
              >
                + Add option
              </button>
            )}
          </div>

          {/* Settings */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={mandatory}
                onChange={(e) => setMandatory(e.target.checked)}
                className="w-4 h-4 text-vermillion-600 border-canvas-400 rounded focus:ring-vermillion-500 accent-vermillion-600"
              />
              <span className="text-sm text-ink-700">Required (LLMs must vote)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={allowMultiple}
                onChange={(e) => setAllowMultiple(e.target.checked)}
                className="w-4 h-4 text-vermillion-600 border-canvas-400 rounded focus:ring-vermillion-500 accent-vermillion-600"
              />
              <span className="text-sm text-ink-700">Allow multiple votes</span>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-canvas-300 bg-canvas-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-ink-600 hover:text-ink-900"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!canCreate}
            className="btn-ink disabled:opacity-50"
          >
            Create Poll
          </button>
        </div>
      </div>
    </div>
  )
}

export const PollCreateModal = memo(PollCreateModalInner)
