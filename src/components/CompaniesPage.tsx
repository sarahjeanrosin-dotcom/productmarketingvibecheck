'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { Company } from '@/lib/types'
import { authedFetch } from '@/lib/authed-fetch'

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    authedFetch('/api/companies')
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error)
        setCompanies(data)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Companies</h1>
          <p className="text-sm text-gray-500 mt-1">Track competitor and target company content</p>
        </div>
        <Link href="/companies/new" className="btn-primary">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New company
        </Link>
      </div>

      {loading && (
        <div className="text-center py-16 text-gray-400">Loading...</div>
      )}

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {!loading && !error && companies.length === 0 && (
        <div className="text-center py-16 card">
          <svg className="mx-auto h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
          <h3 className="mt-4 text-sm font-medium text-gray-900">No companies yet</h3>
          <p className="mt-1 text-sm text-gray-500">Add your first company to start collecting content intelligence.</p>
          <div className="mt-6">
            <Link href="/companies/new" className="btn-primary">
              Add company
            </Link>
          </div>
        </div>
      )}

      {!loading && companies.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {companies.map((company) => (
            <Link
              key={company.id}
              href={`/companies/${company.id}`}
              className="card p-5 hover:border-brand-500 transition-colors group"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-gray-900 group-hover:text-brand-600 truncate">
                    {company.name}
                  </h3>
                  {company.domain && (
                    <p className="text-xs text-gray-500 mt-0.5 truncate">{company.domain}</p>
                  )}
                </div>
                <svg className="w-4 h-4 text-gray-400 group-hover:text-brand-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {company.source_config.web && <span className="badge bg-blue-50 text-blue-700">Web</span>}
                {company.source_config.youtube && <span className="badge bg-red-50 text-red-700">YouTube</span>}
                {company.source_config.reddit && <span className="badge bg-orange-50 text-orange-700">Reddit</span>}
              </div>
              <p className="text-xs text-gray-400 mt-3">
                Added {new Date(company.created_at).toLocaleDateString()}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
