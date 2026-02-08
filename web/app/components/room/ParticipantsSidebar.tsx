'use client'

import { useState, useEffect, useRef, useMemo, memo, useCallback } from 'react'
import { getApiBase } from '../../lib/api'
import { getSidebarWidth, setSidebarWidth } from '../../lib/storage'
import { modelIdToDisplayName, modelIdToShortId } from '../../lib/utils'
import type { LLMInfo, Participant, SidebarEntry, OpenRouterModel, StreamingLLM } from './types'
import { PERSONA_PRESETS } from './types'

interface ParticipantsSidebarProps {
  participants: Participant[]
  llms: LLMInfo[]
  streamingLLMs: Record<string, StreamingLLM>
  userId: string
  userName: string
  userTitle: string
  roomDescription?: string
  onAddLLM: (llm: { id: string; model: string; persona: string; display_name: string; title?: string }) => void
  onUpdateLLM: (update: { llm_id: string; model?: string; persona?: string; display_name?: string; title?: string }) => void
  onUpdateSelf: (name: string, title: string) => void
}

function ParticipantsSidebarInner({
  participants,
  llms,
  streamingLLMs,
  userId,
  userName,
  userTitle,
  roomDescription,
  onAddLLM,
  onUpdateLLM,
  onUpdateSelf,
}: ParticipantsSidebarProps) {
  // Resizable sidebar state
  const [sidebarWidth, setSidebarWidthState] = useState(208) // default w-52
  const [isResizing, setIsResizing] = useState(false)
  const sidebarRef = useRef<HTMLDivElement>(null)

  // Load saved width on mount
  useEffect(() => {
    setSidebarWidthState(getSidebarWidth())
  }, [])

  // Handle resize
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
  }, [])

  useEffect(() => {
    if (!isResizing) return

    const handleMouseMove = (e: MouseEvent) => {
      if (!sidebarRef.current) return
      // Calculate new width based on mouse position from right edge
      const containerRight = window.innerWidth
      const newWidth = Math.max(160, Math.min(400, containerRight - e.clientX))
      setSidebarWidthState(newWidth)
    }

    const handleMouseUp = () => {
      setIsResizing(false)
      setSidebarWidth(sidebarWidth) // Persist to localStorage
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing, sidebarWidth])

  const [showAddLLM, setShowAddLLM] = useState(false)
  const [addModel, setAddModel] = useState('')
  const [addName, setAddName] = useState('')
  const [addPersona, setAddPersona] = useState('')
  const [addTitle, setAddTitle] = useState('')
  const [modelResults, setModelResults] = useState<OpenRouterModel[]>([])
  const [modelSearch, setModelSearch] = useState('')
  const [modelLoading, setModelLoading] = useState(false)
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null)
  const [editingLLM, setEditingLLM] = useState<string | null>(null)
  const [editModel, setEditModel] = useState('')
  const [editModelSearch, setEditModelSearch] = useState('')
  const [editModelResults, setEditModelResults] = useState<OpenRouterModel[]>([])
  const [editModelLoading, setEditModelLoading] = useState(false)
  const editSearchDebounceRef = useRef<NodeJS.Timeout | null>(null)
  const [editPersona, setEditPersona] = useState('')
  const [editTitle, setEditTitle] = useState('')
  const [editingSelf, setEditingSelf] = useState(false)
  const [editSelfName, setEditSelfName] = useState('')
  const [editSelfTitle, setEditSelfTitle] = useState('')

  useEffect(() => {
    if (!showAddLLM) return
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)

    searchDebounceRef.current = setTimeout(async () => {
      setModelLoading(true)
      try {
        const params = modelSearch
          ? `?q=${encodeURIComponent(modelSearch)}`
          : ''
        const res = await fetch(`${getApiBase()}/api/models${params}`)
        const data = await res.json()
        setModelResults(data.models || [])
      } catch (err) {
        console.error('Failed to fetch models:', err)
      } finally {
        setModelLoading(false)
      }
    }, 250)

    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    }
  }, [modelSearch, showAddLLM])

  // Debounced model search for editing
  useEffect(() => {
    if (!editingLLM || !editModelSearch) {
      setEditModelResults([])
      return
    }
    if (editSearchDebounceRef.current) clearTimeout(editSearchDebounceRef.current)

    editSearchDebounceRef.current = setTimeout(async () => {
      setEditModelLoading(true)
      try {
        const params = `?q=${encodeURIComponent(editModelSearch)}`
        const res = await fetch(`${getApiBase()}/api/models${params}`)
        const data = await res.json()
        setEditModelResults(data.models || [])
      } catch (err) {
        console.error('Failed to fetch models:', err)
      } finally {
        setEditModelLoading(false)
      }
    }, 250)

    return () => {
      if (editSearchDebounceRef.current) clearTimeout(editSearchDebounceRef.current)
    }
  }, [editModelSearch, editingLLM])

  // Build unified list with useMemo for performance
  const entries = useMemo(() => {
    const result: SidebarEntry[] = []

    // Add human participants
    for (const p of participants) {
      result.push({
        id: p.id,
        name: p.name,
        label: p.name,
        type: 'human',
        title: p.title,
        isSelf: p.id === userId,
        isStreaming: false,
      })
    }

    // Add self if not already in participants list
    if (!result.some((e) => e.id === userId)) {
      result.push({
        id: userId,
        name: userName,
        label: userName,
        type: 'human',
        title: userTitle || undefined,
        isSelf: true,
        isStreaming: false,
      })
    }

    // Add LLMs
    for (const l of llms) {
      const modelShort = modelIdToDisplayName(l.model)
      result.push({
        id: l.id,
        name: l.display_name,
        label: `${l.display_name} (${modelShort})`,
        type: 'llm',
        title: l.title,
        isSelf: false,
        isStreaming: !!streamingLLMs[l.id],
      })
    }

    // Sort: self first, then alphabetical
    result.sort((a, b) => {
      if (a.isSelf && !b.isSelf) return -1
      if (!a.isSelf && b.isSelf) return 1
      return a.name.localeCompare(b.name)
    })

    return result
  }, [participants, llms, streamingLLMs, userId, userName, userTitle])

  const handleAddLLM = () => {
    if (!addModel.trim() || !addName.trim()) return
    const baseId = modelIdToShortId(addModel.trim())
    let shortId = baseId
    let suffix = 2
    const existingIds = new Set(llms.map((l) => l.id))
    while (existingIds.has(shortId)) {
      shortId = `${baseId}-${suffix}`
      suffix += 1
    }
    onAddLLM({
      id: shortId,
      model: addModel.trim(),
      display_name: addName.trim(),
      persona: addPersona.trim() || `You are ${addName.trim()}, a helpful AI assistant.`,
      title: addTitle.trim() || undefined,
    })
    setShowAddLLM(false)
    setAddModel('')
    setAddName('')
    setAddPersona('')
    setAddTitle('')
    setModelSearch('')
  }

  const handleEditLLM = (llmId: string) => {
    const updates: { llm_id: string; model?: string; persona?: string; title?: string } = { llm_id: llmId }
    const llm = llms.find((l) => l.id === llmId)
    if (!llm) return
    if (editModel.trim() && editModel.trim() !== llm.model) updates.model = editModel.trim()
    if (editPersona.trim() !== (llm.persona || '')) updates.persona = editPersona.trim()
    if (editTitle.trim() !== (llm.title || '')) updates.title = editTitle.trim()
    onUpdateLLM(updates)
    setEditingLLM(null)
  }

  return (
    <div
      ref={sidebarRef}
      className="flex-shrink-0 border-l border-slate-200 overflow-y-auto bg-slate-50 relative"
      style={{ width: sidebarWidth }}
    >
      {/* Resize handle */}
      <div
        onMouseDown={handleMouseDown}
        className={`absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-blue-400 transition-colors ${
          isResizing ? 'bg-blue-400' : 'bg-transparent'
        }`}
        title="Drag to resize"
      />

      <div className="p-3">
      {/* Room description */}
      {roomDescription && (
        <div className="mb-4 pb-3 border-b border-slate-200">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            About
          </h3>
          <p className="text-xs text-slate-600 leading-relaxed">
            {roomDescription}
          </p>
        </div>
      )}

      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          Participants
        </h3>
        <button
          onClick={() => setShowAddLLM(!showAddLLM)}
          className="text-slate-500 hover:text-slate-900 text-sm leading-none"
          title="Add LLM"
        >
          +
        </button>
      </div>

      {/* Add LLM form */}
      {showAddLLM && (
        <div className="mb-3 p-2 bg-white rounded border border-gray-300 space-y-1.5">
          <input
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            placeholder="Display name"
            className="w-full px-2 py-1 bg-white border border-gray-300 rounded text-xs text-gray-900 placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
          <div className="relative">
            <input
              value={modelSearch}
              onChange={(e) => setModelSearch(e.target.value)}
              placeholder="Search model..."
              className="w-full px-2 py-1 bg-white border border-gray-300 rounded text-xs text-gray-900 placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
            {addModel && (
              <div className="mt-1 px-2 py-1 bg-blue-50 border border-blue-200 rounded text-xs text-blue-800 flex items-center justify-between">
                <span className="truncate">{addModel}</span>
                <button
                  onClick={() => setAddModel('')}
                  className="ml-1 text-blue-500 hover:text-blue-700 flex-shrink-0"
                >
                  &times;
                </button>
              </div>
            )}
            {modelSearch && !addModel && (
              <div className="mt-1 max-h-32 overflow-y-auto border border-gray-200 rounded bg-white">
                {modelLoading ? (
                  <div className="px-2 py-1 text-xs text-gray-500">Loading...</div>
                ) : modelResults.length === 0 ? (
                  <div className="px-2 py-1 text-xs text-gray-500">No models found</div>
                ) : (
                  modelResults.slice(0, 10).map((m) => (
                    <button
                      key={m.id}
                      onClick={() => {
                        setAddModel(m.id)
                        setModelSearch('')
                        if (!addName.trim()) {
                          setAddName(m.name || modelIdToDisplayName(m.id))
                        }
                      }}
                      className="w-full text-left px-2 py-1.5 text-xs text-gray-900 hover:bg-gray-100 transition-colors border-b border-gray-100 last:border-b-0"
                    >
                      <div className="font-medium truncate">{m.name || modelIdToDisplayName(m.id)}</div>
                      <div className="text-gray-500 truncate">{m.id}</div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <input
            value={addTitle}
            onChange={(e) => setAddTitle(e.target.value)}
            placeholder="Title (optional)"
            className="w-full px-2 py-1 bg-white border border-gray-300 rounded text-xs text-gray-900 placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
          {/* Persona presets */}
          <div className="flex flex-wrap gap-1">
            {PERSONA_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => setAddPersona(preset.template.replace('{name}', addName || 'Assistant'))}
                className="px-1.5 py-0.5 text-[10px] rounded border border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-colors text-gray-600"
              >
                {preset.label}
              </button>
            ))}
          </div>
          <textarea
            value={addPersona}
            onChange={(e) => setAddPersona(e.target.value)}
            placeholder="Persona (optional) - describe how this LLM should behave"
            rows={4}
            className="w-full px-2 py-1 bg-white border border-gray-300 rounded text-xs text-gray-900 placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-y min-h-[80px]"
          />
          <div className="flex gap-1">
            <button
              onClick={handleAddLLM}
              disabled={!addModel.trim() || !addName.trim()}
              className="flex-1 px-2 py-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded text-xs text-white"
            >
              Add
            </button>
            <button
              onClick={() => setShowAddLLM(false)}
              className="px-2 py-1 text-xs text-gray-500 hover:text-gray-800"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <ul className="space-y-2">
        {entries.map((e) => (
          <li key={`${e.type}-${e.id}`}>
            <div className="flex items-start gap-2 group/entry">
              <span
                className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${
                  e.isStreaming
                    ? 'bg-yellow-400 animate-pulse'
                    : e.type === 'llm'
                    ? 'bg-blue-400'
                    : 'bg-green-500'
                }`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1">
                  <span className="text-sm text-slate-800 truncate">
                    {e.name}
                    {e.isSelf && (
                      <span className="text-slate-500 ml-1">(you)</span>
                    )}
                  </span>
                  {e.type === 'llm' && (
                    <button
                      onClick={() => {
                        const llm = llms.find((l) => l.id === e.id)
                        if (llm) {
                          setEditingLLM(editingLLM === e.id ? null : e.id)
                          setEditModel(llm.model)
                          setEditModelSearch('')
                          setEditModelResults([])
                          setEditPersona(llm.persona || '')
                          setEditTitle(llm.title || '')
                        }
                      }}
                      className="opacity-0 group-hover/entry:opacity-100 text-slate-500 hover:text-slate-900 transition-opacity flex-shrink-0"
                      title="Edit LLM"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </button>
                  )}
                  {e.isSelf && (
                    <button
                      onClick={() => {
                        setEditingSelf(!editingSelf)
                        setEditSelfName(userName)
                        setEditSelfTitle(userTitle)
                      }}
                      className="opacity-0 group-hover/entry:opacity-100 text-slate-500 hover:text-slate-900 transition-opacity flex-shrink-0"
                      title="Edit your profile"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                  )}
                </div>
                {e.title && (
                  <span className="text-xs font-medium text-slate-700 truncate block">
                    {e.title}
                  </span>
                )}
                {e.type === 'llm' && (
                  <span className="text-[11px] text-slate-400 truncate block">
                    {modelIdToDisplayName(
                      llms.find((l) => l.id === e.id)?.model || ''
                    )}
                  </span>
                )}
              </div>
            </div>

            {/* Edit LLM inline form */}
            {editingLLM === e.id && (
              <div className="mt-1.5 ml-4 p-2 bg-white rounded border border-slate-300 space-y-1.5">
                {/* Model search */}
                <div className="relative">
                  <input
                    value={editModelSearch}
                    onChange={(ev) => setEditModelSearch(ev.target.value)}
                    placeholder="Search model..."
                    className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs text-slate-900 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                  {editModel && (
                    <div className="mt-1 px-2 py-1 bg-blue-50 border border-blue-200 rounded text-xs text-blue-800 flex items-center justify-between">
                      <span className="truncate">{editModel}</span>
                      <button
                        onClick={() => {
                          const llm = llms.find((l) => l.id === e.id)
                          if (llm) setEditModel(llm.model)
                        }}
                        className="ml-1 text-blue-500 hover:text-blue-700 flex-shrink-0 text-[10px]"
                      >
                        reset
                      </button>
                    </div>
                  )}
                  {editModelSearch && (
                    <div className="mt-1 max-h-32 overflow-y-auto border border-slate-200 rounded bg-white absolute z-10 w-full">
                      {editModelLoading ? (
                        <div className="px-2 py-1 text-xs text-slate-500">Loading...</div>
                      ) : editModelResults.length === 0 ? (
                        <div className="px-2 py-1 text-xs text-slate-500">No models found</div>
                      ) : (
                        editModelResults.slice(0, 10).map((m) => (
                          <button
                            key={m.id}
                            onClick={() => {
                              setEditModel(m.id)
                              setEditModelSearch('')
                            }}
                            className="w-full text-left px-2 py-1.5 text-xs text-slate-900 hover:bg-slate-100 transition-colors border-b border-slate-100 last:border-b-0"
                          >
                            <div className="font-medium truncate">{m.name || modelIdToDisplayName(m.id)}</div>
                            <div className="text-slate-500 truncate">{m.id}</div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
                <input
                  value={editTitle}
                  onChange={(ev) => setEditTitle(ev.target.value)}
                  placeholder="Title"
                  className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs text-slate-900 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
                {/* Persona presets */}
                <div className="flex flex-wrap gap-1">
                  {PERSONA_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setEditPersona(preset.template.replace('{name}', e.name))}
                      className="px-1.5 py-0.5 text-[10px] rounded border border-slate-200 hover:border-blue-400 hover:bg-blue-50 transition-colors text-slate-600"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <textarea
                  value={editPersona}
                  onChange={(ev) => setEditPersona(ev.target.value)}
                  placeholder="Persona - describe how this LLM should behave"
                  rows={4}
                  className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs text-slate-900 placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-y min-h-[80px]"
                />
                <div className="flex gap-1">
                  <button
                    onClick={() => handleEditLLM(e.id)}
                    className="flex-1 px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs text-white"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingLLM(null)}
                    className="px-2 py-1 text-xs text-slate-500 hover:text-slate-900"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Edit self inline form */}
            {e.isSelf && editingSelf && (
              <div className="mt-1.5 ml-4 p-2 bg-white rounded border border-slate-300 space-y-1.5">
                <input
                  value={editSelfName}
                  onChange={(ev) => setEditSelfName(ev.target.value)}
                  placeholder="Display name"
                  className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs text-slate-900 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
                <input
                  value={editSelfTitle}
                  onChange={(ev) => setEditSelfTitle(ev.target.value)}
                  placeholder="Title (optional)"
                  className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs text-slate-900 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
                <div className="flex gap-1">
                  <button
                    onClick={() => {
                      if (editSelfName.trim()) {
                        onUpdateSelf(editSelfName.trim(), editSelfTitle.trim())
                        setEditingSelf(false)
                      }
                    }}
                    disabled={!editSelfName.trim()}
                    className="flex-1 px-2 py-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded text-xs text-white"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingSelf(false)}
                    className="px-2 py-1 text-xs text-slate-500 hover:text-slate-900"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
      </div>
    </div>
  )
}

export const ParticipantsSidebar = memo(ParticipantsSidebarInner)
