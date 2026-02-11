/**
 * API utilities for communicating with the gateway.
 */

/**
 * Get the base URL for API requests.
 * In local dev (localhost:3000), proxies to localhost:8000.
 * In production, uses relative URLs (same origin).
 */
export function getApiBase(): string {
  if (typeof window === 'undefined') return 'http://127.0.0.1:8000'
  const isLocalDev =
    window.location.hostname === 'localhost' && window.location.port === '3000'
  return isLocalDev ? 'http://127.0.0.1:8000' : ''
}

/**
 * Get the WebSocket URL for a given path.
 * Handles protocol upgrade (http->ws, https->wss) and local dev.
 */
export function getWsUrl(path: string): string {
  if (typeof window === 'undefined') return `ws://127.0.0.1:8000${path}`
  const isLocalDev =
    window.location.hostname === 'localhost' && window.location.port === '3000'
  if (isLocalDev) {
    return `ws://127.0.0.1:8000${path}`
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}${path}`
}
