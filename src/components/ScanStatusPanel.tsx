'use client'

import type { Scan } from '@/lib/types'

interface Props {
  scan: Scan
}

const statusColors: Record<string, string> = {
  queued: 'bg-yellow-100 text-yellow-800',
  running: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
}

const statusDot: Record<string, string> = {
  queued: 'bg-yellow-400',
  running: 'bg-blue-400 animate-pulse',
  completed: 'bg-green-400',
  failed: 'bg-red-400',
}

export default function ScanStatusPanel({ scan }: Props) {
  const stats = scan.stats as Record<string, unknown> | null

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-900">Latest scan</h2>
        <span className={`badge ${statusColors[scan.status] ?? 'bg-gray-100 text-gray-700'} flex items-center gap-1.5`}>
          <span className={`w-1.5 h-1.5 rounded-full ${statusDot[scan.status] ?? 'bg-gray-400'}`} />
          {scan.status}
        </span>
      </div>

      {(scan.status === 'running' || scan.status === 'queued') && (
        <div className="flex items-center gap-3 text-sm text-gray-500 mb-4">
          <svg className="w-4 h-4 animate-spin text-brand-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Collecting and classifying content... this may take a few minutes.
        </div>
      )}

      {scan.error && (
        <div className="mb-4 rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {scan.error}
        </div>
      )}

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <p className="text-2xl font-bold text-gray-900">
              {String(stats.total_items ?? 0)}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">Content items</p>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <p className="text-2xl font-bold text-gray-900">
              {String(stats.iterations ?? 0)}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">Iterations</p>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <p className="text-2xl font-bold text-gray-900">
              {Math.round(((stats.duration_ms as number) ?? 0) / 1000)}s
            </p>
            <p className="text-xs text-gray-500 mt-0.5">Duration</p>
          </div>
          {scan.completed_at && (
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <p className="text-sm font-semibold text-gray-900">
                {new Date(scan.completed_at).toLocaleDateString()}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">Completed</p>
            </div>
          )}
        </div>
      )}

      {!!stats?.by_type && typeof stats.by_type === 'object' && (
        <div className="mt-4">
          <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">By content type</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(stats.by_type as Record<string, number>)
              .sort((a, b) => b[1] - a[1])
              .map(([type, count]) => (
                <span key={type} className="badge bg-gray-100 text-gray-700">
                  {type} <span className="ml-1 font-semibold">{count}</span>
                </span>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}
