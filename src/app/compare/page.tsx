'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { Company, Comparison } from '@/lib/types'
import { authedFetch } from '@/lib/authed-fetch'

interface CompanyOption extends Company {
  has_completed_scan: boolean
}

interface ComparisonListItem extends Comparison {
  company_a_name: string
  company_b_name: string
}

export default function ComparePage() {
  const router = useRouter()
  const [companies, setCompanies] = useState<CompanyOption[]>([])
  const [comparisons, setComparisons] = useState<ComparisonListItem[]>([])
  const [companyAId, setCompanyAId] = useState('')
  const [companyBId, setCompanyBId] = useState('')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [companiesRes, comparisonsRes] = await Promise.all([
          authedFetch('/api/companies'),
          authedFetch('/api/comparisons'),
        ])
        const companiesData: Company[] = await companiesRes.json()
        const comparisonsData: ComparisonListItem[] = await comparisonsRes.json()

        // For each company, check if it has a completed scan
        const scanChecks = await Promise.all(
          companiesData.map(async (co) => {
            const res = await authedFetch(`/api/scans?company_id=${co.id}`)
            if (!res.ok) return { ...co, has_completed_scan: false }
            const data = await res.json()
            return { ...co, has_completed_scan: data.scan?.status === 'completed' }
          })
        )

        setCompanies(scanChecks)
        setComparisons(Array.isArray(comparisonsData) ? comparisonsData : [])
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load data')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const eligibleCompanies = companies.filter((c) => c.has_completed_scan)

  async function handleGenerate() {
    if (!companyAId || !companyBId) return
    setGenerating(true)
    setError(null)
    try {
      const res = await authedFetch('/api/comparisons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_a_id: companyAId, company_b_id: companyBId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to generate comparison')
      router.push(`/compare/${data.id}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setGenerating(false)
    }
  }

  if (loading) {
    return <div className="text-center py-16 text-gray-400">Loading...</div>
  }

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Compare companies</h1>
        <p className="text-sm text-gray-500 mt-1">Select two companies with completed scans to generate a competitive gap analysis.</p>
      </div>

      {/* Generator */}
      <div className="card p-6 space-y-4">
        <h2 className="text-sm font-semibold text-gray-900">New comparison</h2>

        {eligibleCompanies.length < 2 ? (
          <div className="rounded-md bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800">
            You need at least two companies with completed scans to run a comparison.{' '}
            <Link href="/companies/new" className="underline font-medium">Add a company</Link>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Company A</label>
                <select
                  className="input"
                  value={companyAId}
                  onChange={(e) => setCompanyAId(e.target.value)}
                >
                  <option value="">Select company…</option>
                  {eligibleCompanies.map((co) => (
                    <option key={co.id} value={co.id} disabled={co.id === companyBId}>
                      {co.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Company B</label>
                <select
                  className="input"
                  value={companyBId}
                  onChange={(e) => setCompanyBId(e.target.value)}
                >
                  <option value="">Select company…</option>
                  {eligibleCompanies.map((co) => (
                    <option key={co.id} value={co.id} disabled={co.id === companyAId}>
                      {co.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {error && (
              <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              onClick={handleGenerate}
              disabled={!companyAId || !companyBId || companyAId === companyBId || generating}
              className="btn-primary"
            >
              {generating ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Generating analysis…
                </>
              ) : 'Generate comparison'}
            </button>
            <p className="text-xs text-gray-400">This may take 15–30 seconds while the AI analyzes both companies.</p>
          </>
        )}
      </div>

      {/* History */}
      {comparisons.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-900">Past comparisons</h2>
          {comparisons.map((comp) => (
            <Link
              key={comp.id}
              href={`/compare/${comp.id}`}
              className="card p-4 flex items-center justify-between hover:border-brand-300 transition-colors block"
            >
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {comp.company_a_name} <span className="text-gray-400 mx-1">vs</span> {comp.company_b_name}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {new Date(comp.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
