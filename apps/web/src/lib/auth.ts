import { createServerFn } from '@tanstack/react-start'
import { redirect } from '@tanstack/react-router'
import { apiFetch, apiJson } from './api'

export type CurrentUser = {
  id: number
  username: string
  display_name: string
}

export const getCurrentUser = createServerFn({ method: 'GET' }).handler(
  async (): Promise<CurrentUser | null> => {
    try {
      return await apiJson<CurrentUser>('/me')
    } catch {
      return null
    }
  },
)

export const requireUser = createServerFn({ method: 'GET' }).handler(
  async (): Promise<CurrentUser> => {
    try {
      return await apiJson<CurrentUser>('/me')
    } catch {
      throw redirect({ to: '/login' })
    }
  },
)

export const login = createServerFn({ method: 'POST' })
  .validator((data: { username: string; password: string }) => data)
  .handler(async ({ data }): Promise<CurrentUser> => {
    const res = await apiFetch('/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      let detail = 'Login gagal'
      try {
        const body = (await res.json()) as { detail?: string }
        if (body.detail) detail = body.detail
      } catch {
        // ignore, use default message
      }
      throw new Error(detail)
    }
    return res.json()
  })

export const logout = createServerFn({ method: 'POST' }).handler(async () => {
  await apiFetch('/auth/logout', { method: 'POST' })
})
