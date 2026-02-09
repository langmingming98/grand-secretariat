'use client'

import { useState, memo, useCallback } from 'react'
import { modelIdToDisplayName } from '../../lib/utils'
import { EditLLMForm } from './EditLLMForm'
import { EditSelfForm } from './EditSelfForm'
import type { LLMInfo, SidebarEntry } from './types'

interface ParticipantsListProps {
  entries: SidebarEntry[]
  llms: LLMInfo[]
  userId: string
  userName: string
  userTitle: string
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
}

function ParticipantsListInner({
  entries,
  llms,
  userId,
  userName,
  userTitle,
  onUpdateLLM,
  onRemoveLLM,
  onUpdateSelf,
}: ParticipantsListProps) {
  const [editingLLM, setEditingLLM] = useState<string | null>(null)
  const [editingSelf, setEditingSelf] = useState(false)

  const handleEditLLMClick = useCallback(
    (llmId: string) => {
      setEditingLLM(editingLLM === llmId ? null : llmId)
      setEditingSelf(false)
    },
    [editingLLM]
  )

  const handleEditSelfClick = useCallback(() => {
    setEditingSelf(!editingSelf)
    setEditingLLM(null)
  }, [editingSelf])

  const handleRemoveLLM = useCallback(
    (llmId: string, name: string) => {
      if (confirm(`Remove ${name} from this room?`)) {
        onRemoveLLM(llmId)
      }
    },
    [onRemoveLLM]
  )

  const handleSaveLLM = useCallback(
    (update: {
      llm_id: string
      model?: string
      persona?: string
      title?: string
      chat_style?: number
    }) => {
      onUpdateLLM(update)
      setEditingLLM(null)
    },
    [onUpdateLLM]
  )

  const handleSaveSelf = useCallback(
    (name: string, title: string) => {
      onUpdateSelf(name, title)
      setEditingSelf(false)
    },
    [onUpdateSelf]
  )

  return (
    <ul className="space-y-2">
      {entries.map((e) => {
        const llm = llms.find((l) => l.id === e.id)

        return (
          <li key={`${e.type}-${e.id}`}>
            <div className="flex items-start gap-2 group/entry">
              {/* Status indicator */}
              <span
                className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${
                  !e.isOnline
                    ? 'bg-slate-300'
                    : e.isStreaming
                    ? 'bg-yellow-400 animate-pulse'
                    : e.type === 'llm'
                    ? 'bg-blue-400'
                    : 'bg-green-500'
                }`}
                title={e.isOnline ? 'Online' : 'Offline'}
              />

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1">
                  <span className="text-sm text-slate-800 truncate">
                    {e.name}
                    {e.isSelf && <span className="text-slate-500 ml-1">(you)</span>}
                  </span>

                  {/* LLM action buttons */}
                  {e.type === 'llm' && (
                    <>
                      <button
                        onClick={() => handleEditLLMClick(e.id)}
                        className="opacity-0 group-hover/entry:opacity-100 text-slate-500 hover:text-slate-900 transition-opacity flex-shrink-0"
                        title="Edit LLM"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-3 w-3"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleRemoveLLM(e.id, e.name)}
                        className="opacity-0 group-hover/entry:opacity-100 text-slate-400 hover:text-red-600 transition-opacity flex-shrink-0"
                        title="Remove LLM"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-3 w-3"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    </>
                  )}

                  {/* Self edit button */}
                  {e.isSelf && (
                    <button
                      onClick={handleEditSelfClick}
                      className="opacity-0 group-hover/entry:opacity-100 text-slate-500 hover:text-slate-900 transition-opacity flex-shrink-0"
                      title="Edit your profile"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-3 w-3"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                        />
                      </svg>
                    </button>
                  )}
                </div>

                {/* Title */}
                {e.title && (
                  <span className="text-xs font-medium text-slate-700 truncate block">{e.title}</span>
                )}

                {/* Model name for LLMs */}
                {e.type === 'llm' && llm && (
                  <span className="text-[11px] text-slate-400 truncate block">
                    {modelIdToDisplayName(llm.model)}
                  </span>
                )}
              </div>
            </div>

            {/* Edit LLM inline form */}
            {editingLLM === e.id && llm && (
              <EditLLMForm
                llm={llm}
                llmName={e.name}
                onSave={handleSaveLLM}
                onCancel={() => setEditingLLM(null)}
              />
            )}

            {/* Edit self inline form */}
            {e.isSelf && editingSelf && (
              <EditSelfForm
                currentName={userName}
                currentTitle={userTitle}
                onSave={handleSaveSelf}
                onCancel={() => setEditingSelf(false)}
              />
            )}
          </li>
        )
      })}
    </ul>
  )
}

export const ParticipantsList = memo(ParticipantsListInner)
