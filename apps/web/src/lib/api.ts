import { env } from 'cloudflare:workers'
import { getRequestHeader, getResponseHeaders } from '@tanstack/react-start/server'

/**
 * Calls apps/api over the Cloudflare Service Binding (env.API) instead of a
 * public URL — no CORS, no separate public API surface. Forwards the
 * browser's cookie on every call and passes through api's Set-Cookie so
 * `api` stays the single source of truth for the session token.
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  const cookie = getRequestHeader('cookie')
  if (cookie) headers.set('cookie', cookie)

  const response = await env.API.fetch(new URL(path, 'https://flovea-api.internal'), {
    ...init,
    headers,
  })

  const setCookie = response.headers.get('set-cookie')
  if (setCookie) {
    getResponseHeaders().append('set-cookie', setCookie)
  }

  return response
}

export async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await apiFetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...init.headers },
  })
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`API ${path} failed: ${response.status} ${body}`)
  }
  return response.json() as Promise<T>
}
