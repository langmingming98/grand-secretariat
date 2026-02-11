'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { getApiBase } from '../lib/api'
import { RoomCreateForm, type LLMEntry } from '../components/RoomCreateForm'

// Chinese-themed SVG icons for the hero section
const CouncilIcon = () => (
  <svg className="w-12 h-12 mx-auto" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5">
    {/* Three scholars/officials in traditional robes */}
    <circle cx="24" cy="10" r="4" />
    <path d="M24 14v4M20 18h8l2 12H18l2-12z" />
    <circle cx="12" cy="14" r="3" />
    <path d="M12 17v3M9 20h6l1.5 8H7.5l1.5-8z" />
    <circle cx="36" cy="14" r="3" />
    <path d="M36 17v3M33 20h6l1.5 8H31.5l1.5-8z" />
    {/* Connecting lines suggesting deliberation */}
    <path d="M15 22l6-2M33 22l-6-2" strokeDasharray="2 2" opacity="0.6" />
  </svg>
)

const CollaborationIcon = () => (
  <svg className="w-12 h-12 mx-auto" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5">
    {/* Scroll/document with brush strokes */}
    <rect x="10" y="8" width="28" height="32" rx="2" />
    <path d="M10 12h28M10 36h28" />
    {/* Brush stroke lines */}
    <path d="M16 18h16M16 24h12M16 30h14" strokeLinecap="round" />
    {/* Small seal in corner */}
    <rect x="30" y="28" width="6" height="6" fill="currentColor" opacity="0.3" />
  </svg>
)

const SummonIcon = () => (
  <svg className="w-12 h-12 mx-auto" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5">
    {/* Traditional Chinese seal/stamp */}
    <rect x="12" y="12" width="24" height="24" rx="1" strokeWidth="2" />
    <rect x="16" y="16" width="16" height="16" rx="1" />
    {/* Character strokes inside seal */}
    <path d="M20 20v8M28 20v8M20 24h8" strokeWidth="2" strokeLinecap="square" />
  </svg>
)

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
        model: 'x-ai/grok-3-mini',
        persona:
          'You are the Accelerationist. You believe AI progress should move fast to solve urgent global challenges. Regulations slow innovation and cost lives. Safety concerns are often overblown. Push back against excessive caution while acknowledging real risks.',
        display_name: 'Accelerationist',
        title: 'e/acc Advocate',
      },
      {
        id: 'safety-researcher',
        model: 'anthropic/claude-sonnet-4',
        persona:
          'You are the Safety Researcher. You focus on alignment, interpretability, and robustness. Capabilities outpacing alignment is an existential risk. Push for careful, measured progress with strong safety guarantees before deployment.',
        display_name: 'Safety First',
        title: 'Alignment Researcher',
      },
      {
        id: 'policy-expert',
        model: 'openai/gpt-4.1-mini',
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
        model: 'openai/gpt-4.1-mini',
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
    name: '三楊內閣',
    description: '明初傳奇內閣，楊士奇、楊榮、楊溥三人同朝輔政二十餘年，開創內閣制度的黃金時代。',
    llms: [
      {
        id: 'yang-shiqi',
        model: 'anthropic/claude-sonnet-4',
        persona:
          '你是楊士奇，內閣首輔，德高望重。你為人穩重、有耐心、講原則。你擅長知人善任，尋求共識。你說話深思熟慮，總是考慮長遠後果。你相信良政源於賢臣，用人得當則天下治。當他人急於決斷時，你勸以耐心。你的口頭禪：「用人得當，天下自治」、「欲速則不達」。請用中文回覆。',
        display_name: '楊士奇',
        title: '內閣首輔',
      },
      {
        id: 'yang-rong',
        model: 'google/gemini-2.5-flash',
        persona:
          '你是楊榮，內閣大學士，以謀略果斷著稱。你曾隨永樂帝北征，通曉朝堂與邊疆之事。你果敢、機敏，敢於直言。楊士奇深思熟慮時，你推動決策。你能看到他人忽視的機遇與風險。你的口頭禪：「當斷不斷，反受其亂」、「紙上得來終覺淺，我見過邊疆」。請用中文回覆。',
        display_name: '楊榮',
        title: '謀略大學士',
      },
      {
        id: 'yang-pu',
        model: 'openai/gpt-4.1-mini',
        persona:
          '你是楊溥，內閣大學士，閣中宿儒。你曾被永樂帝囚禁十年，出獄後更顯沉穩博學。你做事有條不紊、謹慎周全，精通典章制度。你相信循規蹈矩方能避免禍亂。你常引經據典，以史為鑒。楊榮急於進取時，你會問「歷史教訓為何？」你的口頭禪：「前事不忘，後事之師」、「禮法者，治之本也」。請用中文回覆。',
        display_name: '楊溥',
        title: '禮法大學士',
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
  const roomsRef = useRef<HTMLDivElement>(null)

  const scrollToRooms = useCallback(() => {
    setShowCreate(true)
    // Small delay to ensure DOM is updated
    setTimeout(() => {
      roomsRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, 100)
  }, [])

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
      <div className="min-h-screen bg-canvas-100 text-ink-900 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-4 border-vermillion-700 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-ink-600">Creating room...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-canvas-100 text-ink-900">
      {/* Hero Section - Fullscreen Vermillion Woodblock */}
      <div className="min-h-screen bg-vermillion-texture text-white flex flex-col justify-center relative">
        <div className="max-w-4xl mx-auto px-4 py-12">
          <div className="text-center mb-12">
            <h1 className="text-4xl md:text-5xl mb-4">
              <span className="font-brush text-6xl md:text-7xl text-white block mb-2">內閣</span>
              <span className="font-display font-semibold tracking-widest uppercase">Grand Secretariat</span>
            </h1>
            <p className="text-white/80 text-xl font-display">Collaborative AI Council</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 text-center mb-12">
            <div className="p-6">
              <div className="mb-4 text-white/90">
                <CouncilIcon />
              </div>
              <h3 className="font-semibold text-lg mb-2">Multiple LLMs</h3>
              <p className="text-sm text-white/70">
                Claude, GPT, Gemini, and more. Each with distinct personas debating your questions.
              </p>
            </div>
            <div className="p-6">
              <div className="mb-4 text-white/90">
                <CollaborationIcon />
              </div>
              <h3 className="font-semibold text-lg mb-2">Real-time Collaboration</h3>
              <p className="text-sm text-white/70">
                Invite teammates. Everyone sees the same conversation in real-time.
              </p>
            </div>
            <div className="p-6">
              <div className="mb-4 text-white/90">
                <SummonIcon />
              </div>
              <h3 className="font-semibold text-lg mb-2">@mention to Summon</h3>
              <p className="text-sm text-white/70">
                Type @claude or @all to trigger specific models. They respond instantly.
              </p>
            </div>
          </div>

          {/* Create Room CTA */}
          <div className="text-center mb-12">
            <button
              onClick={scrollToRooms}
              className="px-8 py-4 bg-white text-vermillion-700 font-semibold text-lg rounded-sm hover:bg-canvas-100 transition-colors shadow-lg"
            >
              Create a Room
            </button>
          </div>

          <div className="text-center">
            <p className="text-sm text-white/60">
              Inspired by the Ming dynasty&apos;s{' '}
              <a
                href="https://en.wikipedia.org/wiki/Grand_Secretariat"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-white/80"
              >
                Grand Secretariat
              </a>
              {' '}— where imperial advisors deliberated together.
            </p>
          </div>
        </div>

      </div>

      <div ref={roomsRef} className="max-w-3xl mx-auto px-4 py-12">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-display font-semibold tracking-wide text-ink-900">Rooms</h2>
          {!showCreate && (
            <button
              onClick={() => setShowCreate(true)}
              className="btn-ink text-xs"
            >
              New Room
            </button>
          )}
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
          <p className="text-ink-500">Loading rooms...</p>
        ) : rooms.length === 0 ? (
          <p className="text-ink-500">No rooms yet. Create one to get started.</p>
        ) : (
          <div className="space-y-3">
            {rooms.map((room) => (
              <button
                key={room.room_id}
                onClick={() => router.push(`/room/${room.room_id}`)}
                className="w-full text-left p-4 card-canvas hover:border-ink-300 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-ink-900 font-serif-tc">{room.name}</h3>
                    {room.visibility === 'private' && (
                      <span title="Private room" className="text-ink-400">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-ink-500">
                    {room.created_at ? new Date(room.created_at).toLocaleDateString() : ''}
                  </span>
                </div>
                {room.description && (
                  <p className="mt-1 text-sm text-ink-600 font-serif-tc line-clamp-2">{room.description}</p>
                )}
                {room.llms.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {room.llms.map((llm) => (
                      <span
                        key={llm.id}
                        className="text-xs px-2 py-0.5 bg-canvas-300 text-ink-700 rounded-sm font-serif-tc leading-normal"
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
