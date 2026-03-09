'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { DEFAULT_EXCLUDE_KEYWORDS } from '@/lib/types'
import { authedFetch, getApiErrorMessage, readJsonResponse } from '@/lib/authed-fetch'

export default function NewCompanyPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [domain, setDomain] = useState('')
  const [includeKeywords, setIncludeKeywords] = useState('')
  const [extraExcludeKeywords, setExtraExcludeKeywords] = useState('')
  const [sourceWeb, setSourceWeb] = useState(true)
  const [sourceYoutube, setSourceYoutube] = useState(true)
  const [sourceReddit, setSourceReddit] = useState(true)
  const [maxItems, setMaxItems] = useState(200)
  const [maxIterations, setMaxIterations] = useState(12)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return

    setSaving(true)
    setError(null)

    const body = {
      name: name.trim(),
      domain: domain.trim() || undefined,
      include_keywords: includeKeywords.split(',').map((k) => k.trim()).filter(Boolean),
      exclude_keywords: [
        ...DEFAULT_EXCLUDE_KEYWORDS,
        ...extraExcludeKeywords.split(',').map((k) => k.trim()).filter(Boolean),
      ],
      source_config: {
        web: sourceWeb,
        youtube: sourceYoutube,
        reddit: sourceReddit,
        social: false,
        max_items: maxItems,
        max_iterations: maxIterations,
      },
    }

    try {
      const res = await authedFetch('/api/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await readJsonResponse<{ id?: string; error?: string }>(res)
      if (!res.ok || !data?.id) throw new Error(getApiErrorMessage(data, 'Failed to create company'))
      router.push(`/companies/${data.id}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <Link href="/" className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Home
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">Add company</h1>
      </div>

      <form onSubmit={handleSubmit} className="card p-6 space-y-6">
        {/* Basic info */}
        <section>
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Company info</h2>
          <div className="space-y-4">
            <div>
              <label className="label">
                Company name <span className="text-red-500">*</span>
              </label>
              <input
                className="input"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Acme Corp"
                required
              />
            </div>
            <div>
              <label className="label">Domain (optional)</label>
              <input
                className="input"
                type="text"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="e.g. acmecorp.com"
              />
              <p className="text-xs text-gray-500 mt-1">If provided, enables site-specific search</p>
            </div>
          </div>
        </section>

        {/* Keywords */}
        <section>
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Keywords</h2>
          <div className="space-y-4">
            <div>
              <label className="label">Include keywords (comma-separated)</label>
              <input
                className="input"
                type="text"
                value={includeKeywords}
                onChange={(e) => setIncludeKeywords(e.target.value)}
                placeholder="e.g. AI, automation, enterprise"
              />
              <p className="text-xs text-gray-500 mt-1">Additional terms to search for alongside the company name</p>
            </div>
            <div>
              <label className="label">Extra exclude keywords (comma-separated)</label>
              <input
                className="input"
                type="text"
                value={extraExcludeKeywords}
                onChange={(e) => setExtraExcludeKeywords(e.target.value)}
                placeholder="e.g. deprecated, legacy"
              />
              <p className="text-xs text-gray-500 mt-1">
                Added to defaults: {DEFAULT_EXCLUDE_KEYWORDS.slice(0, 4).join(', ')}...
              </p>
            </div>
          </div>
        </section>

        {/* Sources */}
        <section>
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Sources</h2>
          <div className="space-y-3">
            {[
              { label: 'Web (Serper)', value: sourceWeb, setter: setSourceWeb, desc: 'Websites, blogs, press releases, review sites' },
              { label: 'YouTube', value: sourceYoutube, setter: setSourceYoutube, desc: 'YouTube videos via YouTube Data API' },
              { label: 'Reddit', value: sourceReddit, setter: setSourceReddit, desc: 'Reddit threads via Serper' },
            ].map(({ label, value, setter, desc }) => (
              <label key={label} className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={value}
                  onChange={(e) => setter(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
                />
                <span>
                  <span className="block text-sm font-medium text-gray-900">{label}</span>
                  <span className="block text-xs text-gray-500">{desc}</span>
                </span>
              </label>
            ))}
          </div>
        </section>

        {/* Limits */}
        <section>
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Limits</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Max items</label>
              <input
                className="input"
                type="number"
                min={10}
                max={500}
                value={maxItems}
                onChange={(e) => setMaxItems(Number(e.target.value))}
              />
            </div>
            <div>
              <label className="label">Max iterations</label>
              <input
                className="input"
                type="number"
                min={1}
                max={20}
                value={maxIterations}
                onChange={(e) => setMaxIterations(Number(e.target.value))}
              />
            </div>
          </div>
        </section>

        {error && (
          <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button type="submit" className="btn-primary" disabled={saving || !name.trim()}>
            {saving ? 'Saving...' : 'Create company'}
          </button>
          <Link href="/" className="btn-secondary">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
