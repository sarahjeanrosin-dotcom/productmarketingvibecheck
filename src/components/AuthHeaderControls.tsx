'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import type { Session } from '@supabase/supabase-js'
import { Settings } from 'lucide-react'
import { getBrowserClient } from '@/lib/supabase'

export default function AuthHeaderControls() {
  const pathname = usePathname()
  const router = useRouter()
  const [session, setSession] = useState<Session | null>(null)

  useEffect(() => {
    const supabase = getBrowserClient()

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
    })

    return () => sub.subscription.unsubscribe()
  }, [])

  if (pathname === '/signin' || !session?.user?.email) {
    return null
  }

  async function handleSignOut() {
    const supabase = getBrowserClient()
    await supabase.auth.signOut()
    router.replace('/signin')
  }

  return (
    <div className="ml-auto flex items-center gap-3">
      <Link
        href="/settings"
        className="text-gray-500 hover:text-gray-700 transition-colors"
        aria-label="Settings"
        title="Settings"
      >
        <Settings className="h-5 w-5" strokeWidth={1.9} />
      </Link>
      <span className="text-xs text-gray-600">{session.user.email}</span>
      <button onClick={handleSignOut} className="btn-secondary text-xs px-3 py-1.5">
        Sign out
      </button>
    </div>
  )
}
