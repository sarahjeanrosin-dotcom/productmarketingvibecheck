import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { requireActiveSubscription } from '@/lib/auth-server'
import { runScan, deleteCompanyData } from '@/lib/scanner'
import type { Company } from '@/lib/types'

// Keep request duration short; scan runs asynchronously after enqueue.
export const maxDuration = 60

function normalizeScanErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : 'Scan failed'
  if (/Unexpected token/.test(raw) || /is not valid JSON/i.test(raw)) {
    return 'Upstream service returned an invalid response. Please retry; if it persists, check API key/limits.'
  }
  return raw
}

export async function GET(req: NextRequest) {
  const { accessToken, errorResponse } = await requireActiveSubscription(req)
  if (errorResponse) return errorResponse

  const { searchParams } = new URL(req.url)
  const companyId = searchParams.get('company_id')

  if (!companyId) {
    return NextResponse.json({ error: 'company_id required' }, { status: 400 })
  }

  const db = createServerClient(accessToken ?? undefined)

  // Get the latest scan
  const { data: scan, error: scanError } = await db
    .from('scans')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (scanError && scanError.code !== 'PGRST116') {
    return NextResponse.json({ error: scanError.message }, { status: 500 })
  }

  if (!scan) {
    return NextResponse.json({ scan: null, items: [], insight: null })
  }

  // Get content items for this scan
  const { data: items } = await db
    .from('content_items')
    .select('*')
    .eq('scan_id', scan.id)
    .order('created_at', { ascending: true })

  // Get insight for this scan
  const { data: insight } = await db
    .from('insights')
    .select('*')
    .eq('scan_id', scan.id)
    .single()

  return NextResponse.json({
    scan,
    items: items ?? [],
    insight: insight ?? null,
  })
}

export async function POST(req: NextRequest) {
  const { accessToken, errorResponse } = await requireActiveSubscription(req)
  if (errorResponse) return errorResponse

  const db = createServerClient(accessToken ?? undefined)

  let body: { company_id: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.company_id) {
    return NextResponse.json({ error: 'company_id required' }, { status: 400 })
  }

  // Load company
  const { data: company, error: companyError } = await db
    .from('companies')
    .select('*')
    .eq('id', body.company_id)
    .single()

  if (companyError || !company) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 })
  }

  // Create new scan record
  const { data: scan, error: scanError } = await db
    .from('scans')
    .insert({
      company_id: body.company_id,
      status: 'queued',
    })
    .select()
    .single()

  if (scanError || !scan) {
    return NextResponse.json({ error: scanError?.message ?? 'Failed to create scan' }, { status: 500 })
  }

  // Enqueue job
  const { data: job, error: jobError } = await db
    .from('scan_jobs')
    .insert({
      scan_id: scan.id,
      company_id: body.company_id,
      status: 'queued',
    })
    .select()
    .single()

  if (jobError || !job) {
    return NextResponse.json({ error: jobError?.message ?? 'Failed to enqueue scan job' }, { status: 500 })
  }

  // Trigger background worker (fire-and-forget). Errors here do not block the request.
  const triggerSecret = process.env.INTERNAL_WORKER_SECRET
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || 'http://localhost:3000'
  if (triggerSecret) {
    void fetch(`${baseUrl}/.netlify/functions/scan-worker-background`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-worker-secret': triggerSecret,
      },
      body: JSON.stringify({ jobId: job.id }),
    }).catch((err) => {
      console.warn('Failed to trigger scan worker', err)
    })
  }

  return NextResponse.json({ scan, queued: true, job_id: job.id }, { status: 201 })
}
