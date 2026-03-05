'use client'

import { useState, useMemo } from 'react'
import type { ContentItem, ContentType, ContentSource } from '@/lib/types'

interface Props {
  items: ContentItem[]
}

const typeColors: Record<string, string> = {
  landing: 'bg-purple-50 text-purple-700',
  product: 'bg-brand-50 text-brand-700',
  blog: 'bg-green-50 text-green-700',
  pdf: 'bg-yellow-50 text-yellow-700',
  press: 'bg-cyan-50 text-cyan-700',
  review: 'bg-orange-50 text-orange-700',
  video: 'bg-red-50 text-red-700',
  social: 'bg-pink-50 text-pink-700',
  other: 'bg-gray-100 text-gray-600',
}

const sourceColors: Record<string, string> = {
  web: 'bg-blue-50 text-blue-700',
  youtube: 'bg-red-50 text-red-700',
  reddit: 'bg-orange-50 text-orange-700',
  social: 'bg-pink-50 text-pink-700',
}

const ITEMS_PER_PAGE = 25

export default function ResultsTable({ items }: Props) {
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState<ContentType | ''>('')
  const [filterSource, setFilterSource] = useState<ContentSource | ''>('')
  const [page, setPage] = useState(1)

  const filtered = useMemo(() => {
    let result = items
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(
        (item) =>
          item.title?.toLowerCase().includes(q) ||
          item.url_canonical?.toLowerCase().includes(q) ||
          item.snippet?.toLowerCase().includes(q)
      )
    }
    if (filterType) result = result.filter((item) => item.content_type === filterType)
    if (filterSource) result = result.filter((item) => item.source === filterSource)
    return result
  }, [items, search, filterType, filterSource])

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE)
  const paged = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE)

  // Unique types and sources for filters
  const types = Array.from(new Set(items.map((i) => i.content_type))).sort()
  const sources = Array.from(new Set(items.map((i) => i.source))).sort()

  function resetPage() {
    setPage(1)
  }

  return (
    <div className="card overflow-hidden">
      <div className="p-4 border-b border-gray-200">
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            className="input flex-1"
            type="search"
            placeholder="Search title or URL..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); resetPage() }}
          />
          <select
            className="input w-full sm:w-40"
            value={filterType}
            onChange={(e) => { setFilterType(e.target.value as ContentType | ''); resetPage() }}
          >
            <option value="">All types</option>
            {types.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select
            className="input w-full sm:w-36"
            value={filterSource}
            onChange={(e) => { setFilterSource(e.target.value as ContentSource | ''); resetPage() }}
          >
            <option value="">All sources</option>
            {sources.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          {filtered.length} of {items.length} items
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Title / URL</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-28">Type</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-24">Source</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-24">Platform</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-16">Conf.</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-20">Views</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {paged.map((item) => (
              <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3">
                  <a
                    href={item.url_canonical}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-gray-900 hover:text-brand-600 line-clamp-1"
                  >
                    {item.title || item.url_canonical}
                  </a>
                  <p className="text-xs text-gray-400 truncate mt-0.5">{item.url_canonical}</p>
                </td>
                <td className="px-4 py-3">
                  <span className={`badge ${typeColors[item.content_type] ?? 'bg-gray-100 text-gray-600'}`}>
                    {item.content_type}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`badge ${sourceColors[item.source] ?? 'bg-gray-100 text-gray-600'}`}>
                    {item.source}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">{item.platform ?? '—'}</td>
                <td className="px-4 py-3 text-xs text-gray-500">
                  {item.classification_confidence != null
                    ? `${Math.round(item.classification_confidence * 100)}%`
                    : '—'}
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">
                  {item.metrics?.views != null ? item.metrics.views.toLocaleString() : '—'}
                </td>
              </tr>
            ))}
            {paged.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">
                  No items match your filters
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="p-4 border-t border-gray-200 flex items-center justify-between">
          <button
            className="btn-secondary text-xs"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </button>
          <span className="text-sm text-gray-500">
            Page {page} of {totalPages}
          </span>
          <button
            className="btn-secondary text-xs"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
