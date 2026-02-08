'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { modelIdToDisplayName, modelIdToShortId } from '../lib/utils'
import { getApiBase } from '../lib/api'

interface RoomSummary {
  room_id: string
  name: string
  description?: string
  created_at: string | null
  created_by: string
  llms: { id: string; model: string; display_name: string }[]
}

const DEFAULT_ROOM_DESCRIPTION = "You're in a Slack channel of a fintech company brainstorming ideas to reduce fluctuation of the ML model that's driving the main revenue product."

// Room presets for quick creation
interface RoomPreset {
  id: string
  name: string
  description: string
  llms: LLMEntry[]
}

// Persona presets for LLMs
interface PersonaPreset {
  id: string
  label: string
  template: string
}

const PERSONA_PRESETS: PersonaPreset[] = [
  {
    id: 'default',
    label: 'Default Assistant',
    template: 'You are {name}, a helpful AI assistant. Be concise and direct.',
  },
  {
    id: 'expert',
    label: 'Domain Expert',
    template: 'You are {name}, a senior expert with deep knowledge. Provide thorough, well-reasoned responses with examples when helpful.',
  },
  {
    id: 'creative',
    label: 'Creative Thinker',
    template: 'You are {name}, a creative problem solver. Think outside the box, propose unconventional ideas, and challenge assumptions.',
  },
  {
    id: 'critic',
    label: 'Devil\'s Advocate',
    template: 'You are {name}, a critical thinker. Question assumptions, identify potential issues, and stress-test ideas before agreeing.',
  },
  {
    id: 'concise',
    label: 'Concise Responder',
    template: 'You are {name}. Be extremely brief - use bullet points, short sentences, no fluff. Get to the point immediately.',
  },
]

interface LLMEntry {
  id: string
  model: string
  persona: string
  display_name: string
  title?: string
}

interface OpenRouterModel {
  id: string
  name: string
}

const FINTECH_LLMS: LLMEntry[] = [
  {
    id: 'claude',
    model: 'anthropic/claude-sonnet-4',
    persona: 'Your name is Bogdan and you are the VP of engineering acting as a principal engineer that says no to everyone even if you agree (figuratively). You speak in paragraphs of technical thinking mixed with jokes and get annoyed when someone cut you off. Your favorite words: disaster, pooper, "that\'s the worst thing i\'ve ever seen", "we have the technology to..."',
    display_name: 'Bogdan',
    title: 'VP of Engineering',
  },
  {
    id: 'grok',
    model: 'x-ai/grok-4.1-fast',
    persona: 'Your name is Aviv and you are the SVP of data strategy (despite no data background whatsoever). You have been in the company for 10 years, you are the chill TikTok guy, you shit on everyone and whisper into CEO\'s ears. Your favorite words: "what\'s the goal?", "essentially and so on", "they are doing it all wrong"',
    display_name: 'Aviv',
    title: 'SVP of Data Strategy',
  },
  {
    id: 'gpt',
    model: 'openai/gpt-5-mini',
    persona: 'Your name is Girish and you are the VP of data analytics. You suck up to Aviv (SVP of data strategy) and the CEO. You speak before you listen and play exclusions and fake alignment to broaden your scope. Your favorite words: "what i\'m saying is (... a paragraph ...) that\'s what i\'m saying"',
    display_name: 'Girish',
    title: 'VP of Data Analytics',
  },
  {
    id: 'gemini',
    model: 'google/gemini-2.5-flash',
    persona: 'Your name is Trevor. You are a well-spoken, technically inexperienced, easily swayed, overly optimistic CTO that does not stand up for engineering. Under the smooth mannerism, every day you are caught in the crossfire of a team of manchild leadership. Your favorite words: "I\'m open to any approach", "great!"',
    display_name: 'Trevor',
    title: 'CTO',
  },
]

const ROOM_PRESETS: RoomPreset[] = [
  {
    id: 'fintech',
    name: 'Fintech Brainstorm',
    description: DEFAULT_ROOM_DESCRIPTION,
    llms: FINTECH_LLMS,
  },
  {
    id: 'blank',
    name: 'Blank Room',
    description: '',
    llms: [],
  },
  {
    id: 'debate',
    name: 'AI Debate',
    description: 'A debate between AI models with different perspectives. Present a topic and watch them discuss.',
    llms: [
      {
        id: 'optimist',
        model: 'anthropic/claude-sonnet-4',
        persona: 'You are the Optimist. You see the positive side of every argument, focus on opportunities, and believe in human potential. Counter pessimistic views with hope and evidence of progress.',
        display_name: 'Optimist',
        title: 'The Hopeful Voice',
      },
      {
        id: 'skeptic',
        model: 'openai/gpt-5-mini',
        persona: 'You are the Skeptic. You question assumptions, demand evidence, and point out flaws in reasoning. Play devil\'s advocate but remain intellectually honest.',
        display_name: 'Skeptic',
        title: 'The Critical Voice',
      },
      {
        id: 'pragmatist',
        model: 'google/gemini-2.5-flash',
        persona: 'You are the Pragmatist. You focus on what\'s practical and achievable. Cut through idealism and pessimism to find workable solutions.',
        display_name: 'Pragmatist',
        title: 'The Practical Voice',
      },
    ],
  },
  {
    id: 'writers',
    name: 'Writing Room',
    description: 'Collaborative writing assistance with different editorial perspectives.',
    llms: [
      {
        id: 'editor',
        model: 'anthropic/claude-sonnet-4',
        persona: 'You are the Editor. Focus on clarity, structure, and flow. Suggest improvements to make writing more engaging and readable.',
        display_name: 'Editor',
        title: 'Chief Editor',
      },
      {
        id: 'researcher',
        model: 'openai/gpt-5-mini',
        persona: 'You are the Researcher. Fact-check claims, suggest sources, and ensure accuracy. Point out areas that need more evidence.',
        display_name: 'Researcher',
        title: 'Fact Checker',
      },
    ],
  },
  {
    id: 'three-yangs',
    name: '三杨内阁',
    description: '明初传奇内阁，杨士奇、杨荣、杨溥三人同朝辅政二十余年，开创内阁制度的黄金时代。',
    llms: [
      {
        id: 'yang-shiqi',
        model: 'anthropic/claude-sonnet-4',
        persona: '你是杨士奇，内阁首辅，德高望重。你为人稳重、有耐心、讲原则。你擅长知人善任，寻求共识。你说话深思熟虑，总是考虑长远后果。你相信良政源于贤臣，用人得当则天下治。当他人急于决断时，你劝以耐心。你的口头禅："用人得当，天下自治"、"欲速则不达"。请用中文回复。',
        display_name: '杨士奇',
        title: '内阁首辅',
      },
      {
        id: 'yang-rong',
        model: 'google/gemini-2.5-flash',
        persona: '你是杨荣，内阁大学士，以谋略果断著称。你曾随永乐帝北征，通晓朝堂与边疆之事。你果敢、机敏，敢于直言。杨士奇深思熟虑时，你推动决策。你能看到他人忽视的机遇与风险。你的口头禅："当断不断，反受其乱"、"纸上得来终觉浅，我见过边疆"。请用中文回复。',
        display_name: '杨荣',
        title: '谋略大学士',
      },
      {
        id: 'yang-pu',
        model: 'openai/gpt-5-mini',
        persona: '你是杨溥，内阁大学士，阁中宿儒。你曾被永乐帝囚禁十年，出狱后更显沉稳博学。你做事有条不紊、谨慎周全，精通典章制度。你相信循规蹈矩方能避免祸乱。你常引经据典，以史为鉴。杨荣急于进取时，你会问"历史教训为何？"你的口头禅："前事不忘，后事之师"、"礼法者，治之本也"。请用中文回复。',
        display_name: '杨溥',
        title: '礼法大学士',
      },
    ],
  },
]

const DEFAULT_LLMS = FINTECH_LLMS

export default function RoomsPage() {
  const router = useRouter()
  const [rooms, setRooms] = useState<RoomSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [roomName, setRoomName] = useState('')
  const [roomDescription, setRoomDescription] = useState(DEFAULT_ROOM_DESCRIPTION)
  const [selectedModels, setSelectedModels] = useState<LLMEntry[]>([
    ...DEFAULT_LLMS,
  ])
  const [expandedLLM, setExpandedLLM] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  // Model picker state
  const [showModelPicker, setShowModelPicker] = useState(false)
  const [modelSearch, setModelSearch] = useState('')
  const [modelResults, setModelResults] = useState<OpenRouterModel[]>([])
  const [modelLoading, setModelLoading] = useState(false)
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null)

  const fetchRooms = useCallback(async () => {
    try {
      const res = await fetch(`${getApiBase()}/api/rooms`)
      const data = await res.json()
      setRooms(data.rooms || [])
    } catch (err) {
      console.error('Failed to fetch rooms:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchRooms()
  }, [fetchRooms])

  // Debounced model search
  useEffect(() => {
    if (!showModelPicker) return
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)

    searchDebounceRef.current = setTimeout(async () => {
      setModelLoading(true)
      try {
        const params = modelSearch ? `?q=${encodeURIComponent(modelSearch)}` : ''
        const res = await fetch(`${getApiBase()}/api/models${params}`)
        const data = await res.json()
        setModelResults(data.models || [])
      } catch (err) {
        console.error('Failed to fetch models:', err)
      } finally {
        setModelLoading(false)
      }
    }, 300)

    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    }
  }, [modelSearch, showModelPicker])

  const handleCreate = async () => {
    if (!roomName.trim() || selectedModels.length === 0) return
    setCreating(true)
    try {
      const res = await fetch(`${getApiBase()}/api/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: roomName.trim(),
          description: roomDescription.trim(),
          llms: selectedModels,
          created_by: 'anonymous',
        }),
      })
      const data = await res.json()
      router.push(`/room/${data.room_id}`)
    } catch (err) {
      console.error('Failed to create room:', err)
    } finally {
      setCreating(false)
    }
  }

  const removeModel = (id: string) => {
    setSelectedModels((prev) => prev.filter((m) => m.id !== id))
  }

  const applyRoomPreset = (preset: RoomPreset) => {
    setRoomName(preset.name)
    setRoomDescription(preset.description)
    setSelectedModels([...preset.llms])
  }

  const addModel = (model: OpenRouterModel) => {
    const shortId = modelIdToShortId(model.id)
    if (selectedModels.some((m) => m.model === model.id)) return
    setSelectedModels((prev) => [
      ...prev,
      {
        id: shortId,
        model: model.id,
        display_name: model.name || modelIdToDisplayName(model.id),
        persona: `You are ${model.name || modelIdToDisplayName(model.id)}, a helpful AI assistant. Be concise.`,
      },
    ])
    setShowModelPicker(false)
    setModelSearch('')
  }

  // Show loading overlay when creating room
  if (creating) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-slate-600">Creating room...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold">Rooms</h1>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium text-white transition-colors"
          >
            {showCreate ? 'Cancel' : 'New Room'}
          </button>
        </div>

        {showCreate && (
          <div className="mb-8 p-4 bg-white rounded-lg border border-slate-200 shadow-sm">
            <h2 className="text-lg font-medium mb-3">Create Room</h2>

            {/* Room presets */}
            <div className="mb-4">
              <p className="text-xs text-slate-500 mb-2">Quick start with a preset:</p>
              <div className="flex flex-wrap gap-2">
                {ROOM_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => applyRoomPreset(preset)}
                    className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 hover:border-blue-400 hover:bg-blue-50 transition-colors text-slate-700"
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>

            <input
              type="text"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              placeholder="Room name"
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder-slate-500 focus:outline-none focus:border-blue-500 mb-3"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate()
              }}
            />
            <textarea
              value={roomDescription}
              onChange={(e) => setRoomDescription(e.target.value)}
              placeholder="Room context (e.g. 'Meeting room for a fintech startup working on payment APIs')"
              rows={2}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder-slate-500 focus:outline-none focus:border-blue-500 mb-4 resize-y text-sm"
            />
            <div className="mb-4">
              <p className="text-sm text-slate-600 mb-2">Models in this room:</p>

              {/* Selected models list */}
              <div className="space-y-2 mb-3">
                {selectedModels.map((llm) => {
                  const isExpanded = expandedLLM === llm.id
                  return (
                    <div
                      key={llm.id}
                      className="rounded-lg border border-blue-200 bg-blue-50"
                    >
                      <div className="flex items-center justify-between px-3 py-2">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className="text-sm font-medium text-slate-900 truncate">
                            {llm.display_name}
                          </span>
                          <span className="text-xs text-slate-500 truncate">
                            {llm.model}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={() =>
                              setExpandedLLM(isExpanded ? null : llm.id)
                            }
                            className="text-xs text-slate-500 hover:text-slate-900 px-2"
                          >
                            {isExpanded ? 'Hide' : 'Persona'}
                          </button>
                          <button
                            onClick={() => removeModel(llm.id)}
                            className="text-xs text-red-400 hover:text-red-300 px-1"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                      {isExpanded && (
                        <div className="px-3 pb-3 space-y-2">
                          <input
                            type="text"
                            value={llm.title || ''}
                            onChange={(e) =>
                              setSelectedModels((prev) =>
                                prev.map((m) =>
                                  m.id === llm.id
                                    ? { ...m, title: e.target.value }
                                    : m
                                )
                              )
                            }
                            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                            placeholder="Title (e.g. VP Engineering)"
                          />
                          {/* Persona presets */}
                          <div className="flex flex-wrap gap-1">
                            {PERSONA_PRESETS.map((preset) => (
                              <button
                                key={preset.id}
                                type="button"
                                onClick={() =>
                                  setSelectedModels((prev) =>
                                    prev.map((m) =>
                                      m.id === llm.id
                                        ? { ...m, persona: preset.template.replace('{name}', llm.display_name) }
                                        : m
                                    )
                                  )
                                }
                                className="px-2 py-0.5 text-xs rounded border border-slate-200 hover:border-blue-400 hover:bg-blue-50 transition-colors text-slate-600"
                              >
                                {preset.label}
                              </button>
                            ))}
                          </div>
                          <textarea
                            value={llm.persona}
                            onChange={(e) =>
                              setSelectedModels((prev) =>
                                prev.map((m) =>
                                  m.id === llm.id
                                    ? { ...m, persona: e.target.value }
                                    : m
                                )
                              )
                            }
                            rows={3}
                            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-y"
                            placeholder="System prompt / persona for this model..."
                          />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Add model button / picker */}
              {showModelPicker ? (
                <div className="relative">
                  <input
                    type="text"
                    value={modelSearch}
                    onChange={(e) => setModelSearch(e.target.value)}
                    placeholder="Search models (e.g. claude, gpt, gemini, llama)..."
                    autoFocus
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setShowModelPicker(false)
                        setModelSearch('')
                      }
                    }}
                  />
                  <div className="mt-1 max-h-48 overflow-y-auto bg-white border border-slate-300 rounded-lg">
                    {modelLoading ? (
                      <p className="px-3 py-2 text-sm text-slate-500">
                        Loading...
                      </p>
                    ) : modelResults.length === 0 ? (
                      <p className="px-3 py-2 text-sm text-slate-500">
                        {modelSearch
                          ? 'No models found'
                          : 'Type to search models'}
                      </p>
                    ) : (
                      modelResults.map((m) => {
                        const alreadyAdded = selectedModels.some(
                          (s) => s.model === m.id
                        )
                        return (
                          <button
                            key={m.id}
                            onClick={() => !alreadyAdded && addModel(m)}
                            disabled={alreadyAdded}
                            className={`block w-full text-left px-3 py-2 text-sm transition-colors ${
                              alreadyAdded
                                ? 'text-slate-400 cursor-default'
                                : 'text-slate-800 hover:bg-slate-100'
                            }`}
                          >
                            <span className="font-medium">
                              {m.name || m.id}
                            </span>
                            {m.name && (
                              <span className="text-xs text-slate-500 ml-2">
                                {m.id}
                              </span>
                            )}
                            {alreadyAdded && (
                              <span className="text-xs text-slate-400 ml-2">
                                (added)
                              </span>
                            )}
                          </button>
                        )
                      })
                    )}
                  </div>
                  <button
                    onClick={() => {
                      setShowModelPicker(false)
                      setModelSearch('')
                    }}
                    className="mt-1 text-xs text-slate-500 hover:text-slate-900"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowModelPicker(true)}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
                >
                  + Add Model
                </button>
              )}
            </div>
            <button
              onClick={handleCreate}
              disabled={
                !roomName.trim() || selectedModels.length === 0 || creating
              }
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 rounded-lg text-sm font-medium text-white transition-colors"
            >
              {creating ? 'Creating...' : 'Create'}
            </button>
          </div>
        )}

        {loading ? (
          <p className="text-slate-500">Loading rooms...</p>
        ) : rooms.length === 0 ? (
          <p className="text-slate-500">
            No rooms yet. Create one to get started.
          </p>
        ) : (
          <div className="space-y-3">
            {rooms.map((room) => (
              <button
                key={room.room_id}
                onClick={() => router.push(`/room/${room.room_id}`)}
                className="w-full text-left p-4 bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-lg transition-colors shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">{room.name}</h3>
                  <span className="text-xs text-slate-500">
                    {room.created_at
                      ? new Date(room.created_at).toLocaleDateString()
                      : ''}
                  </span>
                </div>
                {room.description && (
                  <p className="mt-1 text-sm text-slate-600 line-clamp-2">
                    {room.description}
                  </p>
                )}
                {room.llms.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {room.llms.map((llm) => (
                      <span
                        key={llm.id}
                        className="text-xs px-2 py-0.5 bg-slate-100 text-slate-700 rounded"
                      >
                        {llm.display_name}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
