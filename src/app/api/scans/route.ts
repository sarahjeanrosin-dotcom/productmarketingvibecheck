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

  // Fire-and-forget scan execution to avoid gateway timeouts.
  // UI polls GET /api/scans for progress.
  void (async () => {
    try {
      // Replace-on-rerun: delete prior data while preserving this newly queued scan.
      await deleteCompanyData(body.company_id, accessToken ?? undefined, scan.id)
      await runScan(scan.id, company as Company, accessToken ?? undefined)
    } catch (err: unknown) {
      const msg = normalizeScanErrorMessage(err)
      const bgDb = createServerClient(accessToken ?? undefined)
      await bgDb
        .from('scans')
        .update({ status: 'failed', error: msg, completed_at: new Date().toISOString() })
        .eq('id', scan.id)
    }
  })()

  return NextResponse.json({ scan, queued: true }, { status: 201 })
}
