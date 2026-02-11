/**
 * localStorage utilities for user identity and preferences.
 */

// localStorage keys - centralized to avoid typos
export const STORAGE_KEYS = {
  USER_ID: 'grand-secretariat-user-id',
  USER_NAME: 'grand-secretariat-user-name',
  USER_TITLE: 'grand-secretariat-user-title',
  DEBUG_MODE: 'grand-secretariat-debug-mode',
  SIDEBAR_WIDTH: 'grand-secretariat-sidebar-width',
} as const

/**
 * Get the current user's ID, generating one if it doesn't exist.
 */
export function getUserId(): string {
  if (typeof window === 'undefined') return ''
  let id = localStorage.getItem(STORAGE_KEYS.USER_ID)
  if (!id) {
    id = crypto.randomUUID().slice(0, 12)
    localStorage.setItem(STORAGE_KEYS.USER_ID, id)
  }
  return id
}

/**
 * Get the current user's display name.
 */
export function getUserName(): string {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem(STORAGE_KEYS.USER_NAME) || ''
}

/**
 * Set the current user's display name.
 */
export function setUserName(name: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEYS.USER_NAME, name)
  }
}

/**
 * Get the current user's title (e.g., job title).
 */
export function getUserTitle(): string {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem(STORAGE_KEYS.USER_TITLE) || ''
}

/**
 * Set the current user's title.
 */
export function setUserTitle(title: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEYS.USER_TITLE, title)
  }
}

/**
 * Get debug mode preference.
 */
export function getDebugMode(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(STORAGE_KEYS.DEBUG_MODE) === 'true'
}

/**
 * Set debug mode preference.
 */
export function setDebugMode(enabled: boolean): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEYS.DEBUG_MODE, enabled ? 'true' : 'false')
  }
}

/**
 * Get sidebar width preference.
 */
export function getSidebarWidth(): number {
  if (typeof window === 'undefined') return 208 // default w-52 = 13rem = 208px
  const stored = localStorage.getItem(STORAGE_KEYS.SIDEBAR_WIDTH)
  return stored ? parseInt(stored, 10) : 208
}

/**
 * Set sidebar width preference.
 */
export function setSidebarWidth(width: number): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEYS.SIDEBAR_WIDTH, String(width))
  }
}
