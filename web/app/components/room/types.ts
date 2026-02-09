/**
 * Shared types for room components.
 */

import type { ChatMessage, LLMInfo, Participant } from '../../hooks/useRoomSocket'

// Re-export for convenience
export type { ChatMessage, LLMInfo, Participant }

export interface StreamingLLM {
  message_id: string
  llm_id: string
  content: string
  reply_to: string
  is_thinking: boolean
}

export type DisplayMode = 'stream' | 'slack'

export interface SidebarEntry {
  id: string
  name: string
  label: string // name + model for LLMs
  type: 'human' | 'llm'
  title?: string
  avatar?: string
  isSelf: boolean
  isStreaming: boolean
  isOnline: boolean
}

export interface OpenRouterModel {
  id: string
  name: string
}

export interface MentionEntry {
  id: string
  label: string
  sublabel?: string
  type: 'llm' | 'human' | 'special'
  mentionText: string
}

// Persona presets for LLMs
export const PERSONA_PRESETS = [
  { id: 'default', label: 'Default', template: 'You are {name}, a helpful AI assistant. Be concise and direct.' },
  { id: 'expert', label: 'Expert', template: 'You are {name}, a senior expert with deep knowledge. Provide thorough, well-reasoned responses.' },
  { id: 'creative', label: 'Creative', template: 'You are {name}, a creative problem solver. Think outside the box and propose unconventional ideas.' },
  { id: 'critic', label: 'Critic', template: 'You are {name}, a critical thinker. Question assumptions, identify issues, and stress-test ideas.' },
  { id: 'concise', label: 'Brief', template: 'You are {name}. Be extremely brief - bullet points, short sentences, no fluff.' },
] as const

// Chat style options (matches proto enum values)
export const CHAT_STYLES = [
  { id: 0, label: 'Default', description: 'Normal response length' },
  { id: 1, label: 'Conversational', description: 'Short, punchy (1-2 sentences)' },
  { id: 2, label: 'Detailed', description: 'Thorough explanations' },
  { id: 3, label: 'Bullet', description: 'Structured lists' },
] as const

export type ChatStyleId = 0 | 1 | 2 | 3

// Avatar presets - emoji-based avatars
export const AVATAR_PRESETS = {
  // For humans
  human: ['👤', '🧑', '👨', '👩', '🧑‍💻', '👨‍💻', '👩‍💻', '🧑‍💼', '👨‍💼', '👩‍💼', '🧑‍🔬', '🧑‍🎨', '🦸', '🦹', '🧙', '🧝'],
  // For LLMs
  llm: ['🤖', '🧠', '💡', '⚡', '🔮', '🎯', '🦾', '🌟', '🔥', '💎', '🎭', '🦉', '🐙', '🦊', '🐺', '🦁'],
} as const
