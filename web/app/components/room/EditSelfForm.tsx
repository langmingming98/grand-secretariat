'use client'

import { useState, memo, useCallback, useEffect } from 'react'

interface EditSelfFormProps {
  currentName: string
  currentTitle: string
  onSave: (name: string, title: string) => void
  onCancel: () => void
}

function EditSelfFormInner({ currentName, currentTitle, onSave, onCancel }: EditSelfFormProps) {
  const [name, setName] = useState(currentName)
  const [title, setTitle] = useState(currentTitle)

  // Reset form when props change
  useEffect(() => {
    setName(currentName)
    setTitle(currentTitle)
  }, [currentName, currentTitle])

  const handleSubmit = useCallback(() => {
    if (name.trim()) {
      onSave(name.trim(), title.trim())
    }
  }, [name, title, onSave])

  return (
    <div className="mt-1.5 ml-4 p-2 bg-white rounded-sm border border-canvas-300 space-y-1.5">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Display name"
        className="w-full px-2 py-1 bg-white border border-canvas-300 rounded-sm text-xs text-ink-900 placeholder-ink-400 focus:outline-none focus:border-ink-500"
      />
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title (optional)"
        className="w-full px-2 py-1 bg-white border border-canvas-300 rounded-sm text-xs text-ink-900 placeholder-ink-400 focus:outline-none focus:border-ink-500"
      />
      <div className="flex gap-1">
        <button
          onClick={handleSubmit}
          disabled={!name.trim()}
          className="flex-1 px-2 py-1 bg-ink-800 hover:bg-ink-700 disabled:opacity-50 rounded-sm text-xs text-white"
        >
          Save
        </button>
        <button onClick={onCancel} className="px-2 py-1 text-xs text-ink-500 hover:text-ink-900">
          Cancel
        </button>
      </div>
    </div>
  )
}

export const EditSelfForm = memo(EditSelfFormInner)
