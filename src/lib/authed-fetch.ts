'use client'

import { getBrowserClient } from '@/lib/supabase'

export async function getAccessToken(): Promise<string | null> {
  const supabase = getBrowserClient()
  const { data, error } = await supabase.auth.getSession()
  if (error) return null
  return data.session?.access_token ?? null
}

export async function authedFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const token = await getAccessToken()
  const headers = new Headers(init.headers)

  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  return fetch(input, {
    ...init,
    headers,
  })
}
