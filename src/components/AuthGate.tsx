'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import type { Session } from '@supabase/supabase-js'
import { getBrowserClient } from '@/lib/supabase'
import { authedFetch, readJsonResponse } from '@/lib/authed-fetch'

const SUBSCRIPTION_CACHE_KEY = 'subscription_active_v1'

export default function AuthGate({ children }: { children: React.ReactNode }) {
  if (process.env.NEXT_PUBLIC_SKIP_AUTH === 'true') return <>{children}</>
  return <AuthGateInner>{children}</AuthGateInner>
}

function AuthGateInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [subscriptionLoading, setSubscriptionLoading] = useState(true)
  const [subscriptionActive, setSubscriptionActive] = useState<boolean | null>(null)
  const [showAccessLoading, setShowAccessLoading] = useState(false)
  const [checkedUserId, setCheckedUserId] = useState<string | null>(null)

  useEffect(() => {
    const supabase = getBrowserClient()

    supabase.auth.getSession().then(({ data }) => {
      if (typeof window !== 'undefined') {
        const cached = window.sessionStorage.getItem(SUBSCRIPTION_CACHE_KEY)
        if (cached === 'true') setSubscriptionActive(true)
        if (cached === 'false') setSubscriptionActive(false)
      }
      setSession(data.session ?? null)
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setLoading(false)
    })

    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (loading) return

    if (!session) {
      setSubscriptionActive(null)
      setSubscriptionLoading(false)
      setCheckedUserId(null)
      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem(SUBSCRIPTION_CACHE_KEY)
      }
      return
    }

    const currentUserId = session.user?.id ?? null
    const userChanged = checkedUserId !== currentUserId
    const shouldBlock = userChanged || subscriptionActive === null

    if (shouldBlock) {
      setSubscriptionLoading(true)
    }
    let cancelled = false

    const loadStatus = async (attempt: number) => {
      try {
        const res = await authedFetch('/api/billing/status')
        if (!res.ok) throw new Error('Billing status check failed')
        const data = await readJsonResponse<{ isActive?: boolean }>(res)
        if (cancelled) return
        const isActive = Boolean(data?.isActive)
        setSubscriptionActive(isActive)
        setCheckedUserId(currentUserId)
        if (typeof window !== 'undefined') {
          window.sessionStorage.setItem(SUBSCRIPTION_CACHE_KEY, String(isActive))
        }
        if (shouldBlock) {
          setSubscriptionLoading(false)
        }
      } catch {
        if (cancelled) return
        if (attempt < 4) {
          setTimeout(() => {
            void loadStatus(attempt + 1)
          }, 300)
          return
        }
        if (shouldBlock) {
          setSubscriptionActive(null)
          setSubscriptionLoading(false)
        }
      }
    }

    void loadStatus(0)

    return () => {
      cancelled = true
    }
  }, [checkedUserId, loading, session, subscriptionActive])

  useEffect(() => {
    if (!loading && !subscriptionLoading) {
      setShowAccessLoading(false)
      return
    }

    const timer = setTimeout(() => {
      setShowAccessLoading(true)
    }, 200)

    return () => clearTimeout(timer)
  }, [loading, subscriptionLoading])

  useEffect(() => {
    if (loading || subscriptionLoading) return

    const isSigninRoute = pathname === '/signin'
    const isSettingsRoute = pathname === '/settings'
    const pathWithQuery = typeof window === 'undefined'
      ? pathname
      : `${window.location.pathname}${window.location.search}`

    if (!session && !isSigninRoute) {
      router.replace(`/signin?next=${encodeURIComponent(pathWithQuery)}`)
      return
    }

    if (session && isSigninRoute) {
      router.replace('/')
      return
    }

    if (session && subscriptionActive === false && !isSettingsRoute) {
      router.replace('/settings')
      return
    }
  }, [loading, pathname, router, session, subscriptionActive, subscriptionLoading])

  if ((loading || subscriptionLoading) && showAccessLoading) {
    return <div className="py-12 text-center text-sm text-gray-500">Checking account access...</div>
  }

  if (!session && pathname !== '/signin') {
    return null
  }

  if (session && subscriptionActive === false && pathname !== '/settings') {
    return null
  }

  return <>{children}</>
}
