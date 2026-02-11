'use client'

import { useState, useEffect, useRef, useMemo, memo, useCallback } from 'react'
import { getSidebarWidth, setSidebarWidth } from '../../lib/storage'
import { modelIdToDisplayName } from '../../lib/utils'
import { AddLLMForm } from './AddLLMForm'
import { ParticipantsList } from './ParticipantsList'
import type { LLMInfo, Participant, SidebarEntry, StreamingLLM } from './types'

interface ParticipantsSidebarProps {
  participants: Participant[]
  llms: LLMInfo[]
  streamingLLMs: Record<string, StreamingLLM>
  userId: string
  userName: string
  userTitle: string
  roomDescription?: string
  onAddLLM: (llm: {
    id: string
    model: string
    persona: string
    display_name: string
    title?: string
    chat_style?: number
  }) => void
  onUpdateLLM: (update: {
    llm_id: string
    model?: string
    persona?: string
    display_name?: string
    title?: string
    chat_style?: number
  }) => void
  onRemoveLLM: (llm_id: string) => void
  onUpdateSelf: (name: string, title: string) => void
  onUpdateRoomDescription?: (description: string) => void
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
  onRemoveLLM,
  onUpdateSelf,
  onUpdateRoomDescription,
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
  const [isEditingDescription, setIsEditingDescription] = useState(false)
  const [descriptionDraft, setDescriptionDraft] = useState('')

  // Build unified participant/LLM list
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
        isOnline: p.is_online !== false, // default to true if not set
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
        isOnline: true,
      })
    }

    // Add LLMs (always considered online)
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
        isOnline: true,
      })
    }

    // Sort: self first, then online, then offline, then alphabetical
    result.sort((a, b) => {
      if (a.isSelf && !b.isSelf) return -1
      if (!a.isSelf && b.isSelf) return 1
      if (a.isOnline && !b.isOnline) return -1
      if (!a.isOnline && b.isOnline) return 1
      return a.name.localeCompare(b.name)
    })

    return result
  }, [participants, llms, streamingLLMs, userId, userName, userTitle])

  const handleAddLLM = useCallback(
    (llm: {
      id: string
      model: string
      persona: string
      display_name: string
      title?: string
      chat_style?: number
    }) => {
      onAddLLM(llm)
      setShowAddLLM(false)
    },
    [onAddLLM]
  )

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
        <div className="mb-4 pb-3 border-b border-slate-200">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            About
          </h3>
          {isEditingDescription ? (
            <div className="space-y-2">
              <textarea
                className="w-full text-xs text-slate-600 leading-relaxed border border-slate-300 rounded p-2 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                rows={3}
                value={descriptionDraft}
                onChange={(e) => setDescriptionDraft(e.target.value)}
                placeholder="Add a description for this room..."
                autoFocus
              />
              <div className="flex gap-1">
                <button
                  onClick={() => {
                    onUpdateRoomDescription?.(descriptionDraft)
                    setIsEditingDescription(false)
                  }}
                  className="text-xs px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
                >
                  Save
                </button>
                <button
                  onClick={() => setIsEditingDescription(false)}
                  className="text-xs px-2 py-1 text-slate-500 hover:text-slate-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <p
              className="text-xs text-slate-600 leading-relaxed cursor-pointer hover:bg-slate-100 rounded p-1 -m-1"
              onClick={() => {
                setDescriptionDraft(roomDescription || '')
                setIsEditingDescription(true)
              }}
              title="Click to edit"
            >
              {roomDescription || (
                <span className="text-slate-400 italic">Click to add description...</span>
              )}
            </p>
          )}
        </div>

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
          <AddLLMForm
            existingLLMs={llms}
            onAdd={handleAddLLM}
            onCancel={() => setShowAddLLM(false)}
          />
        )}

        {/* Participants list */}
        <ParticipantsList
          entries={entries}
          llms={llms}
          userId={userId}
          userName={userName}
          userTitle={userTitle}
          onUpdateLLM={onUpdateLLM}
          onRemoveLLM={onRemoveLLM}
          onUpdateSelf={onUpdateSelf}
        />
      </div>
    </div>
  )
}

export const ParticipantsSidebar = memo(ParticipantsSidebarInner)
