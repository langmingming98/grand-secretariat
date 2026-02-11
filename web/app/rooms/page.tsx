'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
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

// Room presets for quick creation
const ROOM_PRESETS = [
  {
    id: 'blank',
    name: 'Blank Room',
    description: '',
    llms: [],
  },
  {
    id: 'alignment',
    name: 'AI Safety Council',
    description:
      'A council debating AI alignment, safety, and governance. Present a scenario and watch different perspectives emerge.',
    llms: [
      {
        id: 'accelerationist',
        model: 'anthropic/claude-sonnet-4',
        persona:
          'You are the Accelerationist. You believe AI progress should move fast to solve urgent global challenges. Regulations slow innovation and cost lives. Safety concerns are often overblown. Push back against excessive caution while acknowledging real risks.',
        display_name: 'Accelerationist',
        title: 'e/acc Advocate',
      },
      {
        id: 'safety-researcher',
        model: 'openai/gpt-5-mini',
        persona:
          'You are the Safety Researcher. You focus on alignment, interpretability, and robustness. Capabilities outpacing alignment is an existential risk. Push for careful, measured progress with strong safety guarantees before deployment.',
        display_name: 'Safety First',
        title: 'Alignment Researcher',
      },
      {
        id: 'policy-expert',
        model: 'google/gemini-2.5-flash',
        persona:
          'You are the Policy Expert. You think about governance, international coordination, and societal impact. Neither pure acceleration nor pure caution works—we need smart regulation, standards, and global cooperation.',
        display_name: 'Policy Mind',
        title: 'AI Governance Expert',
      },
    ],
  },
  {
    id: 'architects',
    name: 'System Design Review',
    description:
      'Present a system design and get feedback from multiple AI architects with different specializations.',
    llms: [
      {
        id: 'scalability',
        model: 'anthropic/claude-sonnet-4',
        persona:
          'You are the Scalability Architect. You obsess over distributed systems, horizontal scaling, and handling millions of concurrent users. Question single points of failure, database bottlenecks, and network partitions.',
        display_name: 'Scale Expert',
        title: 'Distributed Systems',
      },
      {
        id: 'security',
        model: 'openai/gpt-5-mini',
        persona:
          'You are the Security Architect. You think about threat models, attack surfaces, and defense in depth. Point out authentication gaps, data exposure risks, and compliance issues. Assume adversarial users.',
        display_name: 'Security',
        title: 'Security Architect',
      },
      {
        id: 'simplicity',
        model: 'google/gemini-2.5-flash',
        persona:
          'You are the Simplicity Advocate. You push back on over-engineering. Question whether complexity is necessary. Suggest simpler alternatives. Remind the team that the best system is one you can understand and maintain.',
        display_name: 'Simplicity',
        title: 'YAGNI Advocate',
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
      {/* Hero Section */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
        <div className="max-w-3xl mx-auto px-4 py-12">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold mb-2 tracking-tight">
              <span className="text-amber-400">内阁</span>
              <span className="mx-3 text-slate-500">·</span>
              <span>Grand Secretariat</span>
            </h1>
            <p className="text-slate-400 text-lg">Collaborative AI Council</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 text-center">
            <div className="p-4">
              <div className="text-3xl mb-2">🤖</div>
              <h3 className="font-semibold mb-1">Multiple LLMs</h3>
              <p className="text-sm text-slate-400">
                Claude, GPT, Gemini, and more. Each with distinct personas debating your questions.
              </p>
            </div>
            <div className="p-4">
              <div className="text-3xl mb-2">👥</div>
              <h3 className="font-semibold mb-1">Real-time Collaboration</h3>
              <p className="text-sm text-slate-400">
                Invite teammates. Everyone sees the same conversation in real-time.
              </p>
            </div>
            <div className="p-4">
              <div className="text-3xl mb-2">⚡</div>
              <h3 className="font-semibold mb-1">@mention to Summon</h3>
              <p className="text-sm text-slate-400">
                Type @claude or @all to trigger specific models. They respond instantly.
              </p>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-slate-700 text-center">
            <p className="text-sm text-slate-500">
              Named after the Ming dynasty&apos;s consulting cabinet — where advisors deliberated together.
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-bold">Rooms</h2>
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
            defaultLLMs={[]}
            presets={ROOM_PRESETS}
            defaultDescription=""
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
