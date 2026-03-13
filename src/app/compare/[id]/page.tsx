'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { authedFetch } from '@/lib/authed-fetch'
import type { Comparison, ComparisonJson } from '@/lib/types'

interface ComparisonDetail extends Comparison {
  company_a_name: string
  company_b_name: string
}

export default function ComparisonDetailPage() {
  const params = useParams()
  const id = params.id as string
  const [comparison, setComparison] = useState<ComparisonDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const res = await authedFetch(`/api/comparisons/${id}`)
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Failed to load comparison')
        setComparison(data)
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  if (loading) return <div className="text-center py-16 text-gray-400">Loading…</div>

  if (error || !comparison) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500">{error ?? 'Comparison not found'}</p>
        <Link href="/compare" className="btn-primary mt-4 inline-flex">Back to Compare</Link>
      </div>
    )
  }

  const c = comparison.comparison_json as ComparisonJson
  const A = comparison.company_a_name
  const B = comparison.company_b_name

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <Link href="/compare" className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 mb-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Compare
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">
          {A} <span className="text-gray-400 font-normal">vs</span> {B}
        </h1>
        <p className="text-xs text-gray-400 mt-1">
          Generated {new Date(comparison.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>

      {/* Messaging Gap — primary focus */}
      <div className="card p-6 space-y-4">
        <h2 className="text-base font-semibold text-gray-900">Messaging gap analysis</h2>
        <p className="text-sm text-gray-700 leading-relaxed">{c.messaging_gap_analysis.gap_summary}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          <div className="rounded-lg bg-blue-50 p-4">
            <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-2">{A} unique messaging</p>
            <ul className="space-y-1">
              {c.messaging_gap_analysis.company_a_unique.map((m, i) => (
                <li key={i} className="text-sm text-blue-900 flex gap-2"><span className="text-blue-400 mt-0.5">•</span>{m}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg bg-violet-50 p-4">
            <p className="text-xs font-semibold text-violet-700 uppercase tracking-wide mb-2">{B} unique messaging</p>
            <ul className="space-y-1">
              {c.messaging_gap_analysis.company_b_unique.map((m, i) => (
                <li key={i} className="text-sm text-violet-900 flex gap-2"><span className="text-violet-400 mt-0.5">•</span>{m}</li>
              ))}
            </ul>
          </div>
        </div>
        {c.messaging_gap_analysis.shared_themes.length > 0 && (
          <div className="rounded-lg bg-gray-50 p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Shared themes</p>
            <div className="flex flex-wrap gap-2">
              {c.messaging_gap_analysis.shared_themes.map((t, i) => (
                <span key={i} className="badge bg-gray-100 text-gray-700">{t}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Side-by-side: ICP + Positioning */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="card p-5 space-y-3">
          <h2 className="text-sm font-semibold text-gray-900">ICP comparison</h2>
          <div className="space-y-2 text-sm">
            <div><span className="text-xs font-medium text-blue-600">{A}</span><p className="text-gray-700 mt-0.5">{c.icp_comparison.company_a}</p></div>
            <div><span className="text-xs font-medium text-violet-600">{B}</span><p className="text-gray-700 mt-0.5">{c.icp_comparison.company_b}</p></div>
          </div>
          {c.icp_comparison.divergence && (
            <div className="text-xs text-gray-500 border-t pt-3">
              <span className="font-medium text-gray-700">Divergence: </span>{c.icp_comparison.divergence}
            </div>
          )}
        </div>

        <div className="card p-5 space-y-3">
          <h2 className="text-sm font-semibold text-gray-900">Positioning delta</h2>
          <div className="space-y-2 text-sm">
            <div><span className="text-xs font-medium text-blue-600">{A}</span><p className="text-gray-700 mt-0.5">{c.positioning_delta.company_a_positioning}</p></div>
            <div><span className="text-xs font-medium text-violet-600">{B}</span><p className="text-gray-700 mt-0.5">{c.positioning_delta.company_b_positioning}</p></div>
          </div>
          {c.positioning_delta.key_differences.length > 0 && (
            <ul className="text-xs text-gray-500 border-t pt-3 space-y-1">
              {c.positioning_delta.key_differences.map((d, i) => (
                <li key={i} className="flex gap-1.5"><span>•</span>{d}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Channel presence */}
      <div className="card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-900">Channel presence</h2>
        <div className="grid grid-cols-2 gap-6">
          {[
            { name: A, breakdown: c.channel_presence.company_a_breakdown, color: 'bg-blue-500' },
            { name: B, breakdown: c.channel_presence.company_b_breakdown, color: 'bg-violet-500' },
          ].map(({ name, breakdown, color }) => (
            <div key={name}>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{name}</p>
              <div className="space-y-1.5">
                {Object.entries(breakdown).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
                  <div key={type} className="flex items-center gap-2 text-sm">
                    <span className="w-20 text-xs text-gray-500 capitalize">{type}</span>
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${color}`}
                        style={{ width: `${Math.min(100, (count / Math.max(...Object.values(breakdown))) * 100)}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-500 w-6 text-right">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        {c.channel_presence.observations.length > 0 && (
          <ul className="text-sm text-gray-600 space-y-1 border-t pt-3">
            {c.channel_presence.observations.map((obs, i) => (
              <li key={i} className="flex gap-2"><span className="text-gray-400">•</span>{obs}</li>
            ))}
          </ul>
        )}
      </div>

      {/* Proof points */}
      <div className="card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-900">Proof points</h2>
        <div className="grid grid-cols-2 gap-4">
          {[
            { name: A, points: c.proof_points.company_a, color: 'text-blue-600' },
            { name: B, points: c.proof_points.company_b, color: 'text-violet-600' },
          ].map(({ name, points, color }) => (
            <div key={name}>
              <p className={`text-xs font-semibold uppercase tracking-wide mb-2 ${color}`}>{name}</p>
              <ul className="space-y-1">
                {points.length > 0
                  ? points.map((p, i) => <li key={i} className="text-sm text-gray-700 flex gap-1.5"><span className="text-gray-400">•</span>{p}</li>)
                  : <li className="text-sm text-gray-400">None identified</li>
                }
              </ul>
            </div>
          ))}
        </div>
        {c.proof_points.gaps.length > 0 && (
          <div className="bg-amber-50 rounded-lg p-4 border-t">
            <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">Gaps — what one uses that the other is missing</p>
            <ul className="space-y-1">
              {c.proof_points.gaps.map((g, i) => (
                <li key={i} className="text-sm text-amber-900 flex gap-1.5"><span>•</span>{g}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Pricing + Strategic opportunities */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="card p-5 space-y-3">
          <h2 className="text-sm font-semibold text-gray-900">Pricing signals</h2>
          <div className="space-y-2 text-sm">
            <div><span className="text-xs font-medium text-blue-600">{A}</span><p className="text-gray-700 mt-0.5">{c.pricing_signals.company_a}</p></div>
            <div><span className="text-xs font-medium text-violet-600">{B}</span><p className="text-gray-700 mt-0.5">{c.pricing_signals.company_b}</p></div>
          </div>
          {c.pricing_signals.delta && (
            <p className="text-xs text-gray-500 border-t pt-3">{c.pricing_signals.delta}</p>
          )}
        </div>

        <div className="card p-5 space-y-3">
          <h2 className="text-sm font-semibold text-gray-900">Strategic opportunities</h2>
          <ul className="space-y-2">
            {c.strategic_opportunities.map((opp, i) => (
              <li key={i} className="text-sm text-gray-700 flex gap-2">
                <span className="text-green-500 font-bold mt-0.5">→</span>
                {opp}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Evidence links */}
      {c.top_evidence_links.length > 0 && (
        <div className="card p-5 space-y-3">
          <h2 className="text-sm font-semibold text-gray-900">Key evidence links</h2>
          <div className="space-y-2">
            {c.top_evidence_links.map((link, i) => (
              <div key={i} className="flex items-start gap-3 py-2 border-b last:border-0">
                <span className={`badge mt-0.5 shrink-0 ${link.company === 'a' ? 'bg-blue-50 text-blue-700' : 'bg-violet-50 text-violet-700'}`}>
                  {link.company === 'a' ? A : B}
                </span>
                <div className="min-w-0">
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-brand-600 hover:underline truncate block"
                  >
                    {link.title}
                  </a>
                  <p className="text-xs text-gray-500 mt-0.5">{link.reason}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
