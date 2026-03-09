import { NextRequest, NextResponse, after } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { runScan, deleteCompanyData } from '@/lib/scanner'
import type { Company } from '@/lib/types'

// Allow up to 5 minutes for background scan execution
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const companyId = searchParams.get('company_id')

  if (!companyId) {
    return NextResponse.json({ error: 'company_id required' }, { status: 400 })
  }

  const db = createServerClient()

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
  const db = createServerClient()

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

  // Replace-on-rerun: delete prior data
  await deleteCompanyData(body.company_id)

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

  // Run scan asynchronously after response is sent.
  // This avoids serverless function timeout killing the scan mid-run.
  after(async () => {
    try {
      await runScan(scan.id, company as Company)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Scan failed'
      const bgDb = createServerClient()
      await bgDb
        .from('scans')
        .update({ status: 'failed', error: msg, completed_at: new Date().toISOString() })
        .eq('id', scan.id)
    }
  })

  // Return immediately — client polls GET /api/scans?company_id= for status
  return NextResponse.json({ scan }, { status: 201 })
}
