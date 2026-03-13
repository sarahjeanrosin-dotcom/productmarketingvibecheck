import { NextRequest, NextResponse } from 'next/server'
import { isSubscriptionBypassUser, requireAuth } from '@/lib/auth-server'
import { createServerClient } from '@/lib/supabase'
import { ACTIVE_SUBSCRIPTION_STATUSES } from '@/lib/stripe'

export async function GET(req: NextRequest) {
  const { user, accessToken, errorResponse } = await requireAuth(req)
  if (errorResponse) return errorResponse

  if (isSubscriptionBypassUser(user?.email)) {
    return NextResponse.json({
      subscription: null,
      isActive: true,
      bypass: true,
    })
  }

  const db = createServerClient(accessToken ?? undefined)
  const { data, error } = await db
    .from('subscriptions')
    .select('*')
    .eq('user_id', user!.id)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const status = data?.status ?? null
  return NextResponse.json({
    subscription: data ?? null,
    isActive: status ? ACTIVE_SUBSCRIPTION_STATUSES.has(status) : false,
  })
}
