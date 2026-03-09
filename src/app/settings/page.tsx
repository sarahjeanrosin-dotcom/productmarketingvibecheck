'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { authedFetch } from '@/lib/authed-fetch'
import { getBrowserClient } from '@/lib/supabase'

interface BillingStatusResponse {
  isActive: boolean
  bypass?: boolean
  subscription: {
    status: string
    current_period_end: string | null
    cancel_at_period_end: boolean
  } | null
}

export default function SettingsPage() {
  const router = useRouter()
  const [status, setStatus] = useState<BillingStatusResponse | null>(null)
  const [loadingStatus, setLoadingStatus] = useState(true)
  const [loadingCheckout, setLoadingCheckout] = useState(false)
  const [loadingCancel, setLoadingCancel] = useState(false)
  const [showCancelForm, setShowCancelForm] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelDetails, setCancelDetails] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    authedFetch('/api/billing/status')
      .then((res) => res.json())
      .then((data) => {
        setStatus(data)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load billing status')
      })
      .finally(() => {
        setLoadingStatus(false)
      })
  }, [])

  async function startCheckout() {
    setLoadingCheckout(true)
    setError(null)
    try {
      const cancelPath = `${window.location.pathname}${window.location.search}`
      const res = await authedFetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cancel_path: cancelPath }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to start checkout')
      if (!data.url) throw new Error('Stripe checkout URL missing')
      window.location.href = data.url
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to start checkout')
      setLoadingCheckout(false)
    }
  }

  async function cancelSubscription() {
    setLoadingCancel(true)
    setError(null)
    try {
      const res = await authedFetch('/api/billing/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: cancelReason,
          details: cancelDetails,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to cancel subscription')
      await getBrowserClient().auth.signOut()
      router.replace('/signin')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to cancel subscription')
      setLoadingCancel(false)
    }
  }

  if (loadingStatus) {
    return <div className="py-12 text-center text-sm text-gray-500">Loading settings...</div>
  }

  const periodEnd = status?.subscription?.current_period_end
    ? new Date(status.subscription.current_period_end).toLocaleDateString()
    : null

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Manage your account and billing.</p>
      </div>

      <div className="card p-6 border-brand-200">
        <h2 className="text-lg font-semibold text-gray-900">Billing</h2>
        <p className="text-sm text-gray-600 mt-1">Content Intelligence Pro - $19.99/month</p>

        {status?.bypass ? (
          <div className="mt-5 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
            This account is on subscription bypass mode for development.
          </div>
        ) : status?.isActive ? (
          <div className="mt-5 space-y-3">
            <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700">
              Subscription active
              {periodEnd ? ` · Renews ${periodEnd}` : ''}
              {status.subscription?.cancel_at_period_end ? ' · Cancels at period end' : ''}
            </div>
            <div className="flex flex-wrap gap-3 items-center">
              <button
                className="btn-danger"
                onClick={() => setShowCancelForm((v) => !v)}
                disabled={loadingCancel}
              >
                {showCancelForm ? 'Never mind' : 'Cancel subscription'}
              </button>
              <button className="btn-primary" onClick={() => router.push('/')}>
                Go to home
              </button>
            </div>

            {showCancelForm && (
              <div className="rounded-md border border-red-200 bg-red-50 p-4 space-y-3">
                <p className="text-sm font-medium text-red-900">
                  Before you cancel, tell us what led to this decision.
                </p>

                <div>
                  <label className="label">Main reason</label>
                  <select
                    className="input"
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    required
                  >
                    <option value="">Select a reason...</option>
                    <option value="too_expensive">Too expensive</option>
                    <option value="missing_features">Missing features</option>
                    <option value="not_using_enough">Not using it enough</option>
                    <option value="switched_tools">Switched to another tool</option>
                    <option value="temporary_pause">Temporary pause</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="label">Additional feedback (optional)</label>
                  <textarea
                    className="input min-h-24"
                    value={cancelDetails}
                    onChange={(e) => setCancelDetails(e.target.value)}
                    placeholder="Anything we should improve?"
                  />
                </div>

                <div className="flex items-center gap-3">
                  <button
                    className="btn-danger"
                    onClick={cancelSubscription}
                    disabled={loadingCancel || !cancelReason}
                  >
                    {loadingCancel ? 'Canceling...' : 'Submit feedback and cancel'}
                  </button>
                  <span className="text-xs text-red-700">
                    You will be signed out immediately after cancellation.
                  </span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            <div className="rounded-md border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
              No active subscription found. Subscribe to unlock scans and company data.
            </div>
            <button className="btn-primary" onClick={startCheckout} disabled={loadingCheckout}>
              {loadingCheckout ? 'Redirecting...' : 'Subscribe for $19.99/month'}
            </button>
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            {error}
          </div>
        )}
      </div>
    </div>
  )
}
