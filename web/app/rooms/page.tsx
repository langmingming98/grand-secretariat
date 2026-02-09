'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { modelIdToDisplayName } from '../lib/utils'
import { getApiBase } from '../lib/api'
import { RoomCreateForm, type LLMEntry } from '../components/RoomCreateForm'

interface RoomSummary {
  room_id: string
  name: string
  description?: string
  created_at: string | null
  created_by: string
  visibility?: 'public' | 'private'
  llms: { id: string; model: string; display_name: string }[]
}

const DEFAULT_ROOM_DESCRIPTION =
  "You're in a Slack channel of a fintech company brainstorming ideas to reduce fluctuation of the ML model that's driving the main revenue product."

// Default LLMs for the fintech preset
const FINTECH_LLMS: LLMEntry[] = [
  {
    id: 'claude',
    model: 'anthropic/claude-sonnet-4',
    persona:
      'Your name is Bogdan and you are the VP of engineering acting as a principal engineer that says no to everyone even if you agree (figuratively). You speak in paragraphs of technical thinking mixed with jokes and get annoyed when someone cut you off. Your favorite words: disaster, pooper, "that\'s the worst thing i\'ve ever seen", "we have the technology to..."',
    display_name: 'Bogdan',
    title: 'VP of Engineering',
  },
  {
    id: 'grok',
    model: 'x-ai/grok-4.1-fast',
    persona:
      'Your name is Aviv and you are the SVP of data strategy (despite no data background whatsoever). You have been in the company for 10 years, you are the chill TikTok guy, you shit on everyone and whisper into CEO\'s ears. Your favorite words: "what\'s the goal?", "essentially and so on", "they are doing it all wrong"',
    display_name: 'Aviv',
    title: 'SVP of Data Strategy',
  },
  {
    id: 'gpt',
    model: 'openai/gpt-5-mini',
    persona:
      'Your name is Girish and you are the VP of data analytics. You suck up to Aviv (SVP of data strategy) and the CEO. You speak before you listen and play exclusions and fake alignment to broaden your scope. Your favorite words: "what i\'m saying is (... a paragraph ...) that\'s what i\'m saying"',
    display_name: 'Girish',
    title: 'VP of Data Analytics',
  },
  {
    id: 'gemini',
    model: 'google/gemini-2.5-flash',
    persona:
      'Your name is Trevor. You are a well-spoken, technically inexperienced, easily swayed, overly optimistic CTO that does not stand up for engineering. Under the smooth mannerism, every day you are caught in the crossfire of a team of manchild leadership. Your favorite words: "I\'m open to any approach", "great!"',
    display_name: 'Trevor',
    title: 'CTO',
  },
]

// Room presets for quick creation
const ROOM_PRESETS = [
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
    description:
      'A debate between AI models with different perspectives. Present a topic and watch them discuss.',
    llms: [
      {
        id: 'optimist',
        model: 'anthropic/claude-sonnet-4',
        persona:
          'You are the Optimist. You see the positive side of every argument, focus on opportunities, and believe in human potential. Counter pessimistic views with hope and evidence of progress.',
        display_name: 'Optimist',
        title: 'The Hopeful Voice',
      },
      {
        id: 'skeptic',
        model: 'openai/gpt-5-mini',
        persona:
          "You are the Skeptic. You question assumptions, demand evidence, and point out flaws in reasoning. Play devil's advocate but remain intellectually honest.",
        display_name: 'Skeptic',
        title: 'The Critical Voice',
      },
      {
        id: 'pragmatist',
        model: 'google/gemini-2.5-flash',
        persona:
          "You are the Pragmatist. You focus on what's practical and achievable. Cut through idealism and pessimism to find workable solutions.",
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
        persona:
          'You are the Editor. Focus on clarity, structure, and flow. Suggest improvements to make writing more engaging and readable.',
        display_name: 'Editor',
        title: 'Chief Editor',
      },
      {
        id: 'researcher',
        model: 'openai/gpt-5-mini',
        persona:
          'You are the Researcher. Fact-check claims, suggest sources, and ensure accuracy. Point out areas that need more evidence.',
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
        persona:
          '你是杨士奇，内阁首辅，德高望重。你为人稳重、有耐心、讲原则。你擅长知人善任，寻求共识。你说话深思熟虑，总是考虑长远后果。你相信良政源于贤臣，用人得当则天下治。当他人急于决断时，你劝以耐心。你的口头禅："用人得当，天下自治"、"欲速则不达"。请用中文回复。',
        display_name: '杨士奇',
        title: '内阁首辅',
      },
      {
        id: 'yang-rong',
        model: 'google/gemini-2.5-flash',
        persona:
          '你是杨荣，内阁大学士，以谋略果断著称。你曾随永乐帝北征，通晓朝堂与边疆之事。你果敢、机敏，敢于直言。杨士奇深思熟虑时，你推动决策。你能看到他人忽视的机遇与风险。你的口头禅："当断不断，反受其乱"、"纸上得来终觉浅，我见过边疆"。请用中文回复。',
        display_name: '杨荣',
        title: '谋略大学士',
      },
      {
        id: 'yang-pu',
        model: 'openai/gpt-5-mini',
        persona:
          '你是杨溥，内阁大学士，阁中宿儒。你曾被永乐帝囚禁十年，出狱后更显沉稳博学。你做事有条不紊、谨慎周全，精通典章制度。你相信循规蹈矩方能避免祸乱。你常引经据典，以史为鉴。杨荣急于进取时，你会问"历史教训为何？"你的口头禅："前事不忘，后事之师"、"礼法者，治之本也"。请用中文回复。',
        display_name: '杨溥',
        title: '礼法大学士',
      },
    ],
  },
]

export default function RoomsPage() {
  const router = useRouter()
  const [rooms, setRooms] = useState<RoomSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)

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

  const handleCreate = useCallback(
    async (data: { name: string; description: string; llms: LLMEntry[]; visibility: 'public' | 'private' }) => {
      setCreating(true)
      try {
        const res = await fetch(`${getApiBase()}/api/rooms`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: data.name,
            description: data.description,
            llms: data.llms,
            visibility: data.visibility,
            created_by: 'anonymous',
          }),
        })
        const result = await res.json()
        router.push(`/room/${result.room_id}`)
      } catch (err) {
        console.error('Failed to create room:', err)
        setCreating(false)
      }
    },
    [router]
  )

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
          <RoomCreateForm
            onSubmit={handleCreate}
            onCancel={() => setShowCreate(false)}
            defaultLLMs={FINTECH_LLMS}
            presets={ROOM_PRESETS}
            defaultDescription={DEFAULT_ROOM_DESCRIPTION}
          />
        )}

        {loading ? (
          <p className="text-slate-500">Loading rooms...</p>
        ) : rooms.length === 0 ? (
          <p className="text-slate-500">No rooms yet. Create one to get started.</p>
        ) : (
          <div className="space-y-3">
            {rooms.map((room) => (
              <button
                key={room.room_id}
                onClick={() => router.push(`/room/${room.room_id}`)}
                className="w-full text-left p-4 bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-lg transition-colors shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium">{room.name}</h3>
                    {room.visibility === 'private' && (
                      <span title="Private room" className="text-slate-400">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-slate-500">
                    {room.created_at ? new Date(room.created_at).toLocaleDateString() : ''}
                  </span>
                </div>
                {room.description && (
                  <p className="mt-1 text-sm text-slate-600 line-clamp-2">{room.description}</p>
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
