/**
 * Model ID utilities
 */

export function modelIdToDisplayName(modelId: string): string {
  // "anthropic/claude-sonnet-4" → "Claude Sonnet 4"
  const afterSlash = modelId.includes('/') ? modelId.split('/')[1] : modelId
  return afterSlash
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export function modelIdToShortId(modelId: string): string {
  // "anthropic/claude-sonnet-4" → "claude-sonnet-4"
  return modelId.includes('/') ? modelId.split('/')[1] : modelId
}

/**
 * Time formatting utilities
 */

export function formatTime(ts: number): string {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/**
 * Message content utilities
 */

/**
 * Remove the sender's name prefix from message content.
 * LLMs sometimes prefix their responses with their own name (e.g., "Claude: Hello").
 * This function strips that prefix for cleaner display.
 */
export function stripSenderPrefix(content: string, senderName: string): string {
  if (!content || !senderName) return content
  const escaped = senderName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const prefixRe = new RegExp(`^\\s*${escaped}\\s*[:\\-]\\s*`, 'i')
  let cleaned = content
  // Some models repeat their own name prefix more than once
  for (let i = 0; i < 3; i += 1) {
    const next = cleaned.replace(prefixRe, '')
    if (next === cleaned) break
    cleaned = next
  }
  return cleaned
}

/**
 * Mention parsing utilities
 */

export interface TextSegment {
  type: 'text' | 'mention'
  content: string
}

/**
 * Parse text content into segments, identifying @mentions.
 * Matches @word patterns (including @all, @everyone, @here).
 */
export function parseMentions(text: string): TextSegment[] {
  // Support Unicode (Chinese, etc.) in mentions
  const mentionRe = /@[\w\u4e00-\u9fff-]+/gu
  const segments: TextSegment[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = mentionRe.exec(text)) !== null) {
    // Add text before the mention
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: text.slice(lastIndex, match.index) })
    }
    // Add the mention
    segments.push({ type: 'mention', content: match[0] })
    lastIndex = match.index + match[0].length
  }

  // Add remaining text
  if (lastIndex < text.length) {
    segments.push({ type: 'text', content: text.slice(lastIndex) })
  }

  return segments
}

/**
 * Avatar color utilities
 */

const AVATAR_COLORS = [
  'bg-blue-500',
  'bg-green-500',
  'bg-purple-500',
  'bg-orange-500',
  'bg-pink-500',
  'bg-teal-500',
  'bg-indigo-500',
  'bg-red-500',
  'bg-cyan-500',
  'bg-amber-500',
]

/**
 * Get a consistent avatar color for a given ID string.
 * Uses a simple hash to ensure the same ID always gets the same color.
 */
export function getAvatarColor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash) + id.charCodeAt(i)
    hash = hash & hash // Convert to 32bit integer
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

/**
 * LLM display utilities
 */

export interface LLMInfo {
  id: string
  model: string
  display_name: string
  persona?: string
  title?: string
}

/**
 * Get a display label for an LLM, falling back through display_name, model name, then ID.
 */
export function llmDisplayLabel(llmId: string, llms: LLMInfo[]): string {
  const info = llms.find((l) => l.id === llmId)
  if (!info) return llmId
  const name = info.display_name?.trim()
  if (name) return name
  if (info.model) return modelIdToDisplayName(info.model)
  return llmId
}

/**
 * Emoji shorthand conversion
 */

const EMOJI_MAP: Record<string, string> = {
  // Faces
  ':smile:': '😊',
  ':grin:': '😁',
  ':laughing:': '😆',
  ':joy:': '😂',
  ':rofl:': '🤣',
  ':wink:': '😉',
  ':blush:': '😊',
  ':thinking:': '🤔',
  ':confused:': '😕',
  ':frown:': '🙁',
  ':cry:': '😢',
  ':sob:': '😭',
  ':angry:': '😠',
  ':rage:': '😡',
  ':scream:': '😱',
  ':cool:': '😎',
  ':nerd:': '🤓',
  ':eyes:': '👀',
  ':eye_roll:': '🙄',
  ':sleeping:': '😴',
  // Gestures
  ':thumbsup:': '👍',
  ':+1:': '👍',
  ':thumbsdown:': '👎',
  ':-1:': '👎',
  ':clap:': '👏',
  ':wave:': '👋',
  ':pray:': '🙏',
  ':muscle:': '💪',
  ':point_up:': '☝️',
  ':point_down:': '👇',
  ':point_left:': '👈',
  ':point_right:': '👉',
  ':ok_hand:': '👌',
  ':raised_hands:': '🙌',
  ':handshake:': '🤝',
  // Hearts & symbols
  ':heart:': '❤️',
  ':broken_heart:': '💔',
  ':fire:': '🔥',
  ':star:': '⭐',
  ':sparkles:': '✨',
  ':check:': '✅',
  ':x:': '❌',
  ':warning:': '⚠️',
  ':question:': '❓',
  ':exclamation:': '❗',
  ':bulb:': '💡',
  ':rocket:': '🚀',
  ':tada:': '🎉',
  ':trophy:': '🏆',
  ':100:': '💯',
  // Objects
  ':coffee:': '☕',
  ':beer:': '🍺',
  ':pizza:': '🍕',
  ':cake:': '🍰',
  ':book:': '📖',
  ':memo:': '📝',
  ':pencil:': '✏️',
  ':computer:': '💻',
  ':phone:': '📱',
  ':email:': '📧',
  ':calendar:': '📅',
  ':clock:': '🕐',
  ':lock:': '🔒',
  ':key:': '🔑',
  ':hammer:': '🔨',
  ':wrench:': '🔧',
  ':gear:': '⚙️',
  ':link:': '🔗',
  ':bug:': '🐛',
}

/**
 * Convert emoji shortcodes like :smile: to actual emoji characters.
 */
export function convertEmojiShortcodes(text: string): string {
  return text.replace(/:[a-z0-9_+-]+:/gi, (match) => {
    return EMOJI_MAP[match.toLowerCase()] || match
  })
}
