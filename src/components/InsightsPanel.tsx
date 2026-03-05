'use client'

import { useState } from 'react'
import type { Insight, InsightsJson } from '@/lib/types'

interface Props {
  insight: Insight
}

export default function InsightsPanel({ insight }: Props) {
  const [open, setOpen] = useState(true)
  const ij = insight.insights_json as InsightsJson

  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between p-5 hover:bg-gray-50 transition-colors"
      >
        <h2 className="text-sm font-semibold text-gray-900">Strategic insights</h2>
        <svg
          className={`w-4 h-4 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-5 border-t border-gray-100 pt-4">
          {/* Product & ICP */}
          <div className="grid sm:grid-cols-2 gap-4">
            <InsightBlock title="Primary product / category">
              <p className="text-sm text-gray-700">{ij.primary_product_category}</p>
            </InsightBlock>
            <InsightBlock title="ICP / Audience">
              <p className="text-sm text-gray-700">{ij.icp_audience}</p>
            </InsightBlock>
          </div>

          {/* Messaging pillars */}
          {ij.messaging_pillars?.length > 0 && (
            <InsightBlock title="Messaging pillars">
              <ul className="space-y-1.5">
                {ij.messaging_pillars.map((p, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                    <span className="mt-1 w-1.5 h-1.5 rounded-full bg-brand-500 flex-shrink-0" />
                    {p}
                  </li>
                ))}
              </ul>
            </InsightBlock>
          )}

          {/* Themes by content type */}
          {ij.themes_by_content_type && Object.keys(ij.themes_by_content_type).length > 0 && (
            <InsightBlock title="Themes by content type">
              <div className="grid sm:grid-cols-2 gap-4">
                {Object.entries(ij.themes_by_content_type).map(([type, themes]) => (
                  <div key={type}>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 capitalize">
                      {type}
                    </p>
                    <ul className="space-y-1">
                      {(themes as string[]).map((theme, i) => (
                        <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                          <span className="mt-1 w-1.5 h-1.5 rounded-full bg-gray-400 flex-shrink-0" />
                          {theme}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </InsightBlock>
          )}

          {/* Competitive notes */}
          {ij.competitive_notes && (
            <InsightBlock title="Competitive notes">
              <div className="space-y-3">
                {ij.competitive_notes.emphasis?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">What they emphasize</p>
                    <ul className="space-y-1">
                      {ij.competitive_notes.emphasis.map((e, i) => (
                        <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                          <span className="mt-1 w-1.5 h-1.5 rounded-full bg-orange-400 flex-shrink-0" />
                          {e}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {ij.competitive_notes.proof_points?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Proof points</p>
                    <ul className="space-y-1">
                      {ij.competitive_notes.proof_points.map((p, i) => (
                        <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                          <span className="mt-1 w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />
                          {p}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {ij.competitive_notes.positioning && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Positioning</p>
                    <p className="text-sm text-gray-700">{ij.competitive_notes.positioning}</p>
                  </div>
                )}
                {ij.competitive_notes.pricing_signals && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Pricing signals</p>
                    <p className="text-sm text-gray-700">{ij.competitive_notes.pricing_signals}</p>
                  </div>
                )}
              </div>
            </InsightBlock>
          )}

          {/* Top evidence links */}
          {ij.top_evidence_links?.length > 0 && (
            <InsightBlock title="Top evidence links">
              <div className="space-y-2">
                {ij.top_evidence_links.map((link, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <span className="text-xs text-gray-400 font-mono mt-0.5 w-5 flex-shrink-0">{i + 1}</span>
                    <div className="min-w-0">
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium text-brand-600 hover:underline line-clamp-1"
                      >
                        {link.title || link.url}
                      </a>
                      <p className="text-xs text-gray-500 mt-0.5">{link.reason}</p>
                    </div>
                  </div>
                ))}
              </div>
            </InsightBlock>
          )}
        </div>
      )}
    </div>
  )
}

function InsightBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{title}</p>
      {children}
    </div>
  )
}
