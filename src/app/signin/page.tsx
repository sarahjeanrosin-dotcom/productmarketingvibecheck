'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserClient } from '@/lib/supabase'

const PASSWORD_REQUIREMENTS = [
  { label: 'At least 12 characters', test: (value: string) => value.length >= 12 },
  { label: 'One uppercase letter', test: (value: string) => /[A-Z]/.test(value) },
  { label: 'One lowercase letter', test: (value: string) => /[a-z]/.test(value) },
  { label: 'One number', test: (value: string) => /\d/.test(value) },
  { label: 'One special character', test: (value: string) => /[^A-Za-z0-9]/.test(value) },
]

export default function SignInPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [oauthLoading, setOauthLoading] = useState(false)
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setMessage(null)

    const supabase = getBrowserClient()
    const cleanEmail = email.trim()
    const redirectTo = '/'

    try {
      if (mode === 'signin') {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        })
        if (signInError) throw signInError
        router.replace(redirectTo)
      } else {
        const failedRequirements = PASSWORD_REQUIREMENTS.filter((req) => !req.test(password))
        if (failedRequirements.length > 0) {
          throw new Error('Password does not meet requirements.')
        }

        if (password !== confirmPassword) {
          throw new Error('Passwords do not match.')
        }

        const { data, error: signUpError } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
        })
        if (signUpError) throw signUpError

        if (data.session) {
          router.replace(redirectTo)
          return
        }

        setMessage('Account created. Confirm your email, then sign in to subscribe.')
        setMode('signin')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogleAuth() {
    setOauthLoading(true)
    setError(null)
    setMessage(null)

    try {
      const supabase = getBrowserClient()
      const redirectTo = `${window.location.origin}/`
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo },
      })
      if (oauthError) throw oauthError
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed')
      setOauthLoading(false)
    }
  }

  return (
    <div className="max-w-md mx-auto">
      <div className="card p-6">
        <h1 className="text-2xl font-bold text-gray-900">
          {mode === 'signin' ? 'Sign in' : 'Create account'}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {mode === 'signin'
            ? 'Access your content intelligence workspace.'
            : 'Create an account to access the workspace.'}
        </p>

        <button
          type="button"
          className="btn-secondary w-full mt-5"
          onClick={handleGoogleAuth}
          disabled={oauthLoading || loading}
        >
          {oauthLoading ? 'Redirecting...' : 'Continue with Google'}
        </button>

        <div className="relative my-5">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-200" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-white px-2 text-gray-500">or use email</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Email</label>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>
          <div>
            <label className="label">Password</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              minLength={6}
              required
            />
          </div>

          {mode === 'signup' && (
            <>
              <div>
                <label className="label">Confirm password</label>
                <input
                  className="input"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  minLength={12}
                  required
                />
              </div>
              <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700 space-y-1">
                {PASSWORD_REQUIREMENTS.map((req) => (
                  <p key={req.label}>
                    {req.test(password) ? '✓' : '•'} {req.label}
                  </p>
                ))}
              </div>
            </>
          )}

          {error && (
            <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
              {error}
            </div>
          )}
          {message && (
            <div className="rounded-md bg-green-50 border border-green-200 p-3 text-sm text-green-700">
              {message}
            </div>
          )}

          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? 'Please wait...' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <button
          onClick={() => {
            setMode(mode === 'signin' ? 'signup' : 'signin')
            setError(null)
            setMessage(null)
            setPassword('')
            setConfirmPassword('')
          }}
          className="text-sm text-brand-600 hover:text-brand-700 mt-4"
          type="button"
        >
          {mode === 'signin'
            ? 'Need an account? Create one'
            : 'Already have an account? Sign in'}
        </button>
      </div>
    </div>
  )
}
