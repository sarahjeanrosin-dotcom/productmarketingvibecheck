import Stripe from 'stripe'

let stripeClient: Stripe | null = null

export function getStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) {
    throw new Error('Missing STRIPE_SECRET_KEY')
  }

  if (!stripeClient) {
    stripeClient = new Stripe(secretKey)
  }

  return stripeClient
}

export function getBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    'http://localhost:3000'
  )
}

export const ACTIVE_SUBSCRIPTION_STATUSES = new Set([
  'trialing',
  'active',
])
