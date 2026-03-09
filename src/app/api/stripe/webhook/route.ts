import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { getStripeClient } from '@/lib/stripe'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

export async function POST(req: Request) {
  const stripe = getStripeClient()
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    return NextResponse.json({ error: 'Missing STRIPE_WEBHOOK_SECRET' }, { status: 500 })
  }

  const signature = (await headers()).get('stripe-signature')
  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  }

  const body = await req.text()

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Invalid webhook signature'
    return NextResponse.json({ error: message }, { status: 400 })
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session
      if (session.mode === 'subscription' && session.subscription) {
        await syncSubscription(String(session.subscription))
      }
    }

    if (
      event.type === 'customer.subscription.created' ||
      event.type === 'customer.subscription.updated' ||
      event.type === 'customer.subscription.deleted'
    ) {
      const subscription = event.data.object as Stripe.Subscription
      await syncSubscription(subscription.id)
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Webhook processing failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}

async function syncSubscription(subscriptionId: string) {
  const stripe = getStripeClient()
  const subscriptionResponse = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ['customer'],
  })
  const subscription = subscriptionResponse as unknown as Stripe.Subscription

  const customer = subscription.customer as Stripe.Customer | string | null
  const customerObj = typeof customer === 'string' ? null : customer

  const userId =
    subscription.metadata?.supabase_user_id ||
    customerObj?.metadata?.supabase_user_id

  if (!userId) {
    throw new Error(`Missing supabase_user_id metadata for subscription ${subscription.id}`)
  }

  const priceId = subscription.items.data[0]?.price?.id ?? null
  const periodEndUnix = subscription.items.data[0]?.current_period_end ?? null
  const customerId = typeof customer === 'string' ? customer : customer?.id ?? null

  const supabaseAdmin = getSupabaseAdminClient()
  const { error } = await supabaseAdmin
    .from('subscriptions')
    .upsert(
      {
        user_id: userId,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscription.id,
        stripe_price_id: priceId,
        status: subscription.status,
        current_period_end: periodEndUnix
          ? new Date(periodEndUnix * 1000).toISOString()
          : null,
        cancel_at_period_end: subscription.cancel_at_period_end,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )

  if (error) {
    throw new Error(error.message)
  }
}
