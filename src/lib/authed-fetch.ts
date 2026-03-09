'use client'

import { getBrowserClient } from '@/lib/supabase'

function isApiDebugEnabled(): boolean {
  return process.env.NEXT_PUBLIC_DEBUG_API_LOGS === 'true'
}

export async function getAccessToken(): Promise<string | null> {
  const supabase = getBrowserClient()
  const { data, error } = await supabase.auth.getSession()
  if (error) return null
  return data.session?.access_token ?? null
}

export async function authedFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const token = await getAccessToken()
  const headers = new Headers(init.headers)
  const method = (init.method || 'GET').toUpperCase()
  const url = typeof input === 'string' ? input : input.toString()

  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const start = performance.now()
  const res = await fetch(input, {
    ...init,
    headers,
  })

  if (isApiDebugEnabled()) {
    const durationMs = Math.round(performance.now() - start)
    console.info('[api]', {
      method,
      url,
      status: res.status,
      ok: res.ok,
      durationMs,
    })
  }

  return res
}

export async function readJsonResponse<T>(res: Response): Promise<T | null> {
  const text = await res.text()
  if (!text) return null

  try {
    return JSON.parse(text) as T
  } catch (err) {
    console.error('Failed to parse JSON response', {
      url: res.url,
      status: res.status,
      statusText: res.statusText,
      contentType: res.headers.get('content-type'),
      bodyPreview: text.slice(0, 300),
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

export function getApiErrorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object' && 'error' in payload) {
    const err = (payload as { error?: unknown }).error
    if (typeof err === 'string' && err.trim()) return err
  }
  return fallback
}
