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
      className="flex-shrink-0 border-l border-canvas-300 overflow-y-auto bg-canvas-200 relative"
      style={{ width: sidebarWidth }}
    >
      {/* Resize handle */}
      <div
        onMouseDown={handleMouseDown}
        className={`absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-vermillion-400 transition-colors ${
          isResizing ? 'bg-vermillion-400' : 'bg-transparent'
        }`}
        title="Drag to resize"
      />

      <div className="p-3">
        {/* Room description */}
        <div className="mb-4 pb-3 border-b border-canvas-300">
          <h3 className="text-xs font-semibold text-ink-500 uppercase tracking-wider mb-2">
            About
          </h3>
          {isEditingDescription ? (
            <div className="space-y-2">
              <textarea
                className="w-full text-xs text-ink-600 leading-relaxed border border-canvas-400 rounded-sm p-2 focus:outline-none focus:ring-1 focus:ring-ink-500 resize-none"
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
                  className="text-xs px-2 py-1 bg-ink-800 text-white rounded-sm hover:bg-ink-700"
                >
                  Save
                </button>
                <button
                  onClick={() => setIsEditingDescription(false)}
                  className="text-xs px-2 py-1 text-ink-500 hover:text-ink-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <p
              className="text-xs text-ink-600 leading-relaxed cursor-pointer hover:bg-canvas-300 rounded-sm p-1 -m-1 font-serif-tc"
              onClick={() => {
                setDescriptionDraft(roomDescription || '')
                setIsEditingDescription(true)
              }}
              title="Click to edit"
            >
              {roomDescription || (
                <span className="text-ink-400 italic font-sans">Click to add description...</span>
              )}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-ink-500 uppercase tracking-wider">
            Participants
          </h3>
          <button
            onClick={() => setShowAddLLM(!showAddLLM)}
            className="text-ink-500 hover:text-ink-900 text-sm leading-none"
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
