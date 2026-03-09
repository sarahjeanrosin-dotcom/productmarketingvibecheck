import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { createServerClient } from '@/lib/supabase'
import { getStripeClient } from '@/lib/stripe'

export async function POST(req: NextRequest) {
  const { user, accessToken, errorResponse } = await requireAuth(req)
  if (errorResponse) return errorResponse

  let body: { reason?: string; details?: string } = {}
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  const reason = body.reason?.trim()
  const details = body.details?.trim() || null
  if (!reason) {
    return NextResponse.json({ error: 'Cancellation reason is required' }, { status: 400 })
  }

  const db = createServerClient(accessToken ?? undefined)
  const { data: subscription, error } = await db
    .from('subscriptions')
    .select('stripe_subscription_id, status')
    .eq('user_id', user!.id)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!subscription?.stripe_subscription_id) {
    return NextResponse.json({ error: 'No active subscription found' }, { status: 400 })
  }

  const { data: feedback, error: feedbackError } = await db
    .from('cancellation_feedback')
    .insert({
      user_id: user!.id,
      stripe_subscription_id: subscription.stripe_subscription_id,
      reason,
      details,
      cancel_result: 'requested',
    })
    .select('id')
    .single()

  if (feedbackError) {
    return NextResponse.json({ error: feedbackError.message }, { status: 500 })
  }

  try {
    const stripe = getStripeClient()
    const canceled = await stripe.subscriptions.cancel(subscription.stripe_subscription_id)
    const periodEndUnix = canceled.items.data[0]?.current_period_end ?? null

    const { error: updateError } = await db
      .from('subscriptions')
      .update({
        status: canceled.status,
        current_period_end: periodEndUnix ? new Date(periodEndUnix * 1000).toISOString() : null,
        cancel_at_period_end: canceled.cancel_at_period_end,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user!.id)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    await db
      .from('cancellation_feedback')
      .update({
        cancel_result: 'succeeded',
        updated_at: new Date().toISOString(),
      })
      .eq('id', feedback.id)
      .eq('user_id', user!.id)

    return NextResponse.json({ ok: true, status: canceled.status })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to cancel subscription'

    await db
      .from('cancellation_feedback')
      .update({
        cancel_result: 'failed',
        error_message: message,
        updated_at: new Date().toISOString(),
      })
      .eq('id', feedback.id)
      .eq('user_id', user!.id)

    return NextResponse.json({ error: message }, { status: 500 })
  }
}
