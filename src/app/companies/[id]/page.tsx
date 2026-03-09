'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import type { Company, Scan, ContentItem, Insight } from '@/lib/types'
import ScanStatusPanel from '@/components/ScanStatusPanel'
import ResultsTable from '@/components/ResultsTable'
import InsightsPanel from '@/components/InsightsPanel'
import { authedFetch } from '@/lib/authed-fetch'

export default function CompanyPage() {
  const params = useParams()
  const router = useRouter()
  const companyId = params.id as string

  const [company, setCompany] = useState<Company | null>(null)
  const [scan, setScan] = useState<Scan | null>(null)
  const [items, setItems] = useState<ContentItem[]>([])
  const [insight, setInsight] = useState<Insight | null>(null)
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState(false)

  const loadData = useCallback(async () => {
    try {
      const [companyRes, scanRes] = await Promise.all([
        authedFetch(`/api/companies/${companyId}`),
        authedFetch(`/api/scans?company_id=${companyId}`),
      ])

      const companyData = await companyRes.json()
      if (!companyRes.ok) throw new Error(companyData.error ?? 'Failed to load company')
      setCompany(companyData)

      const scanData = await scanRes.json()
      if (scanRes.ok && scanData) {
        setScan(scanData.scan)
        setItems(scanData.items ?? [])
        setInsight(scanData.insight ?? null)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Poll while scan is running
  useEffect(() => {
    if (!scan || (scan.status !== 'running' && scan.status !== 'queued')) return

      const interval = setInterval(async () => {
      const res = await authedFetch(`/api/scans?company_id=${companyId}`)
      if (!res.ok) return
      const data = await res.json()
      if (data.scan) {
        setScan(data.scan)
        setItems(data.items ?? [])
        setInsight(data.insight ?? null)
        if (data.scan.status === 'completed' || data.scan.status === 'failed') {
          clearInterval(interval)
        }
      }
    }, 3000)

    return () => clearInterval(interval)
  }, [scan?.status, companyId])

  async function handleRunScan() {
    setScanning(true)
    setError(null)
    try {
      const res = await authedFetch('/api/scans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: companyId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to start scan')
      setScan(data.scan)
      setItems([])
      setInsight(null)
      // Scan runs synchronously — reload items and insight now that it's done
      await loadData()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setScanning(false)
    }
  }

  async function handleDelete() {
    if (!deleteConfirm) {
      setDeleteConfirm(true)
      return
    }
    try {
      const res = await authedFetch(`/api/companies/${companyId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete')
      router.push('/')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  if (loading) {
    return <div className="text-center py-16 text-gray-400">Loading...</div>
  }

  if (!company) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500">Company not found</p>
        <Link href="/" className="btn-primary mt-4 inline-flex">Back to home</Link>
      </div>
    )
  }

  const isRunning = scan?.status === 'running' || scan?.status === 'queued'

  async function handleExport(type: 'csv' | 'pdf') {
    if (!scan?.id) return

    try {
      const res = await authedFetch(`/api/export/${type}/${scan.id}`)
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        throw new Error(payload.error ?? `Failed to export ${type.toUpperCase()}`)
      }

      const blob = await res.blob()
      const disposition = res.headers.get('content-disposition')
      const fileNameMatch = disposition?.match(/filename="(.+)"/)
      const fileName = fileNameMatch?.[1] ?? `${company?.name ?? 'report'}.${type}`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Export failed')
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link href="/" className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 mb-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Home
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">{company.name}</h1>
          {company.domain && (
            <a
              href={`https://${company.domain}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-brand-500 hover:underline mt-0.5 inline-block"
            >
              {company.domain}
            </a>
          )}
        </div>
        <div className="flex items-center gap-2">
          {scan?.status === 'completed' && (
            <>
              <button
                className="btn-secondary text-xs"
                onClick={() => handleExport('csv')}
              >
                Export CSV
              </button>
              <button
                className="btn-secondary text-xs"
                onClick={() => handleExport('pdf')}
              >
                Export PDF
              </button>
            </>
          )}
          <button
            onClick={handleRunScan}
            disabled={scanning || isRunning}
            className="btn-primary"
          >
            {isRunning ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Scanning...
              </>
            ) : scanning ? 'Starting...' : scan ? 'Run new scan' : 'Run scan'}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Company details */}
      <div className="card p-5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-xs text-gray-500 uppercase tracking-wide">Sources</span>
            <div className="mt-1 flex flex-wrap gap-1">
              {company.source_config.web && <span className="badge bg-blue-50 text-blue-700">Web</span>}
              {company.source_config.youtube && <span className="badge bg-red-50 text-red-700">YouTube</span>}
              {company.source_config.reddit && <span className="badge bg-orange-50 text-orange-700">Reddit</span>}
            </div>
          </div>
          <div>
            <span className="text-xs text-gray-500 uppercase tracking-wide">Max items</span>
            <p className="mt-1 font-medium">{company.source_config.max_items}</p>
          </div>
          <div>
            <span className="text-xs text-gray-500 uppercase tracking-wide">Max iterations</span>
            <p className="mt-1 font-medium">{company.source_config.max_iterations}</p>
          </div>
          {company.include_keywords && company.include_keywords.length > 0 && (
            <div>
              <span className="text-xs text-gray-500 uppercase tracking-wide">Include keywords</span>
              <p className="mt-1 text-xs text-gray-700">{company.include_keywords.join(', ')}</p>
            </div>
          )}
        </div>
      </div>

      {/* Scan status */}
      {scan && <ScanStatusPanel scan={scan} />}

      {/* Insights */}
      {insight && <InsightsPanel insight={insight} />}

      {/* Results table */}
      {items.length > 0 && <ResultsTable items={items} />}

      {/* Danger zone */}
      <div className="card p-5 border-red-100">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Danger zone</h3>
        <div className="flex items-center gap-3">
          <button
            onClick={handleDelete}
            className={deleteConfirm ? 'btn-danger' : 'btn-secondary text-red-600 border-red-300 hover:bg-red-50'}
          >
            {deleteConfirm ? 'Confirm delete' : 'Delete company'}
          </button>
          {deleteConfirm && (
            <button onClick={() => setDeleteConfirm(false)} className="btn-secondary text-sm">
              Cancel
            </button>
          )}
          {deleteConfirm && (
            <span className="text-sm text-red-600">This will delete all scans and content items.</span>
          )}
        </div>
      </div>
    </div>
  )
}
