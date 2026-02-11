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
    <div className="mt-1.5 ml-4 p-2 bg-white rounded border border-slate-300 space-y-1.5">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Display name"
        className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs text-slate-900 placeholder-slate-500 focus:outline-none focus:border-blue-500"
      />
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title (optional)"
        className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs text-slate-900 placeholder-slate-500 focus:outline-none focus:border-blue-500"
      />
      <div className="flex gap-1">
        <button
          onClick={handleSubmit}
          disabled={!name.trim()}
          className="flex-1 px-2 py-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded text-xs text-white"
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

export const EditSelfForm = memo(EditSelfFormInner)
