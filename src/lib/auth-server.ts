import { NextRequest, NextResponse } from 'next/server'
import type { User } from '@supabase/supabase-js'
import { createServerClient } from '@/lib/supabase'
import { ACTIVE_SUBSCRIPTION_STATUSES } from '@/lib/stripe'

interface AuthResult {
  user: User | null
  accessToken: string | null
  errorResponse: NextResponse | null
}

interface SubscriptionAuthResult extends AuthResult {
  subscriptionActive: boolean
}

export function isSubscriptionBypassUser(email?: string | null): boolean {
  if (!email) return false

  const raw = process.env.SUBSCRIPTION_BYPASS_EMAILS || ''
  if (!raw.trim()) return false

  const normalizeEmail = (value: string) => {
    const lower = value.trim().toLowerCase()
    const atIndex = lower.indexOf('@')
    if (atIndex < 0) return lower

    const local = lower.slice(0, atIndex)
    const domain = lower.slice(atIndex + 1)

    if (domain === 'gmail.com' || domain === 'googlemail.com') {
      const localNoTag = local.split('+')[0]
      const localNoDots = localNoTag.replace(/\./g, '')
      return `${localNoDots}@gmail.com`
    }

    return `${local}@${domain}`
  }

  const normalizedUser = normalizeEmail(email)
  const allowlist = raw
    .split(',')
    .map((item) => normalizeEmail(item))
    .filter(Boolean)

  return allowlist.includes(normalizedUser)
}

export async function requireAuth(req: NextRequest): Promise<AuthResult> {
  if (process.env.NEXT_PUBLIC_SKIP_AUTH === 'true') {
    return { user: null, accessToken: null, errorResponse: null }
  }

  const authHeader = req.headers.get('authorization')
  if (!authHeader?.toLowerCase().startsWith('bearer ')) {
    return {
      user: null,
      accessToken: null,
      errorResponse: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }

  const token = authHeader.slice(7).trim()
  if (!token) {
    return {
      user: null,
      accessToken: null,
      errorResponse: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }

  const supabase = createServerClient()
  const { data, error } = await supabase.auth.getUser(token)

  if (error || !data.user) {
    return {
      user: null,
      accessToken: null,
      errorResponse: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }

  return { user: data.user, accessToken: token, errorResponse: null }
}

export async function requireActiveSubscription(req: NextRequest): Promise<SubscriptionAuthResult> {
  if (process.env.NEXT_PUBLIC_SKIP_AUTH === 'true') {
    return { user: null, accessToken: null, errorResponse: null, subscriptionActive: true }
  }

  const auth = await requireAuth(req)
  if (auth.errorResponse || !auth.user || !auth.accessToken) {
    return { ...auth, subscriptionActive: false }
  }

  if (isSubscriptionBypassUser(auth.user.email)) {
    return {
      ...auth,
      subscriptionActive: true,
      errorResponse: null,
    }
  }

  const db = createServerClient(auth.accessToken)
  const { data, error } = await db
    .from('subscriptions')
    .select('status')
    .eq('user_id', auth.user.id)
    .maybeSingle()

  if (error) {
    return {
      ...auth,
      subscriptionActive: false,
      errorResponse: NextResponse.json({ error: error.message }, { status: 500 }),
    }
  }

  const isActive = Boolean(data?.status && ACTIVE_SUBSCRIPTION_STATUSES.has(data.status))
  if (!isActive) {
    return {
      ...auth,
      subscriptionActive: false,
      errorResponse: NextResponse.json({ error: 'Subscription required' }, { status: 402 }),
    }
  }

  return {
    ...auth,
    subscriptionActive: true,
    errorResponse: null,
  }
}
