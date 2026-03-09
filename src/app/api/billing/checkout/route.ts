import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { createServerClient } from '@/lib/supabase'
import { getStripeClient, getBaseUrl, ACTIVE_SUBSCRIPTION_STATUSES } from '@/lib/stripe'

export async function POST(req: NextRequest) {
  const { user, accessToken, errorResponse } = await requireAuth(req)
  if (errorResponse) return errorResponse

  let body: { cancel_path?: string } = {}
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  const priceId = process.env.STRIPE_PRICE_ID
  if (!priceId) {
    return NextResponse.json({ error: 'Missing STRIPE_PRICE_ID' }, { status: 500 })
  }

  const db = createServerClient(accessToken ?? undefined)
  const { data: existingSub, error: subError } = await db
    .from('subscriptions')
    .select('stripe_customer_id, status')
    .eq('user_id', user!.id)
    .maybeSingle()

  if (subError) {
    return NextResponse.json({ error: subError.message }, { status: 500 })
  }

  if (existingSub?.status && ACTIVE_SUBSCRIPTION_STATUSES.has(existingSub.status)) {
    return NextResponse.json({ error: 'Subscription already active. Use the billing portal.' }, { status: 409 })
  }

  const stripe = getStripeClient()
  const baseUrl = getBaseUrl()
  const customerId = existingSub?.stripe_customer_id ?? undefined
  const cancelPath = body.cancel_path?.startsWith('/') ? body.cancel_path : '/subscribe'

  try {
    if (customerId) {
      await stripe.customers.update(customerId, {
        metadata: {
          supabase_user_id: user!.id,
        },
      })
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/?success=1`,
      cancel_url: `${baseUrl}${cancelPath}`,
      allow_promotion_codes: true,
      client_reference_id: user!.id,
      customer: customerId,
      customer_email: customerId ? undefined : user!.email ?? undefined,
      metadata: {
        supabase_user_id: user!.id,
      },
      subscription_data: {
        metadata: {
          supabase_user_id: user!.id,
        },
      },
    })

    return NextResponse.json({ url: session.url })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create checkout session'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
