import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { createServerClient } from '@/lib/supabase'
import { getStripeClient, getBaseUrl } from '@/lib/stripe'

export async function POST(req: NextRequest) {
  const { user, accessToken, errorResponse } = await requireAuth(req)
  if (errorResponse) return errorResponse

  const db = createServerClient(accessToken ?? undefined)
  const { data: subscription, error } = await db
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', user!.id)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!subscription?.stripe_customer_id) {
    return NextResponse.json({ error: 'No Stripe customer found for this account' }, { status: 400 })
  }

  try {
    const stripe = getStripeClient()
    const portal = await stripe.billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: `${getBaseUrl()}/subscribe`,
    })

    return NextResponse.json({ url: portal.url })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create billing portal session'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
