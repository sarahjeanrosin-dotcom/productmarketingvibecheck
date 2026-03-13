import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-server'
import { generateComparison } from '@/lib/compare'
import type { InsightsJson, ContentItem } from '@/lib/types'

export async function GET(req: NextRequest) {
  const { accessToken, errorResponse } = await requireAuth(req)
  if (errorResponse) return errorResponse
  const db = createServerClient(accessToken ?? undefined)

  const { data, error } = await db
    .from('comparisons')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Fetch company names for display
  const companyIds = Array.from(new Set([
    ...(data ?? []).map((c) => c.company_a_id),
    ...(data ?? []).map((c) => c.company_b_id),
  ]))

  const { data: companies } = await db
    .from('companies')
    .select('id, name')
    .in('id', companyIds)

  const nameMap: Record<string, string> = {}
  for (const co of companies ?? []) {
    nameMap[co.id] = co.name
  }

  const enriched = (data ?? []).map((c) => ({
    ...c,
    company_a_name: nameMap[c.company_a_id] ?? 'Unknown',
    company_b_name: nameMap[c.company_b_id] ?? 'Unknown',
  }))

  return NextResponse.json(enriched)
}

export async function POST(req: NextRequest) {
  const { accessToken, errorResponse } = await requireAuth(req)
  if (errorResponse) return errorResponse
  const db = createServerClient(accessToken ?? undefined)

  let body: { company_a_id: string; company_b_id: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.company_a_id || !body.company_b_id) {
    return NextResponse.json({ error: 'company_a_id and company_b_id required' }, { status: 400 })
  }

  if (body.company_a_id === body.company_b_id) {
    return NextResponse.json({ error: 'Cannot compare a company with itself' }, { status: 400 })
  }

  // Load both companies
  const [companyARes, companyBRes] = await Promise.all([
    db.from('companies').select('*').eq('id', body.company_a_id).single(),
    db.from('companies').select('*').eq('id', body.company_b_id).single(),
  ])

  if (companyARes.error || !companyARes.data) {
    return NextResponse.json({ error: 'Company A not found' }, { status: 404 })
  }
  if (companyBRes.error || !companyBRes.data) {
    return NextResponse.json({ error: 'Company B not found' }, { status: 404 })
  }

  // Get latest completed scan for each company
  const [scanARes, scanBRes] = await Promise.all([
    db.from('scans').select('*').eq('company_id', body.company_a_id).eq('status', 'completed')
      .order('created_at', { ascending: false }).limit(1).single(),
    db.from('scans').select('*').eq('company_id', body.company_b_id).eq('status', 'completed')
      .order('created_at', { ascending: false }).limit(1).single(),
  ])

  if (scanARes.error || !scanARes.data) {
    return NextResponse.json({ error: `${companyARes.data.name} has no completed scan` }, { status: 400 })
  }
  if (scanBRes.error || !scanBRes.data) {
    return NextResponse.json({ error: `${companyBRes.data.name} has no completed scan` }, { status: 400 })
  }

  const scanA = scanARes.data
  const scanB = scanBRes.data

  // Get insights for each scan
  const [insightARes, insightBRes] = await Promise.all([
    db.from('insights').select('*').eq('scan_id', scanA.id).single(),
    db.from('insights').select('*').eq('scan_id', scanB.id).single(),
  ])

  if (insightARes.error || !insightARes.data) {
    return NextResponse.json({ error: `No insights found for ${companyARes.data.name}` }, { status: 400 })
  }
  if (insightBRes.error || !insightBRes.data) {
    return NextResponse.json({ error: `No insights found for ${companyBRes.data.name}` }, { status: 400 })
  }

  // Get content items for each scan
  const [itemsARes, itemsBRes] = await Promise.all([
    db.from('content_items').select('*').eq('scan_id', scanA.id),
    db.from('content_items').select('*').eq('scan_id', scanB.id),
  ])

  const itemsA = (itemsARes.data ?? []) as ContentItem[]
  const itemsB = (itemsBRes.data ?? []) as ContentItem[]

  // Generate comparison
  const { summary_md, comparison_json } = await generateComparison(
    companyARes.data.name,
    companyBRes.data.name,
    insightARes.data.insights_json as InsightsJson,
    insightBRes.data.insights_json as InsightsJson,
    itemsA,
    itemsB
  )

  // Save comparison
  const { data: comparison, error: saveError } = await db
    .from('comparisons')
    .insert({
      company_a_id: body.company_a_id,
      company_b_id: body.company_b_id,
      scan_a_id: scanA.id,
      scan_b_id: scanB.id,
      summary_md,
      comparison_json,
    })
    .select()
    .single()

  if (saveError || !comparison) {
    return NextResponse.json({ error: saveError?.message ?? 'Failed to save comparison' }, { status: 500 })
  }

  return NextResponse.json({
    ...comparison,
    company_a_name: companyARes.data.name,
    company_b_name: companyBRes.data.name,
  }, { status: 201 })
}
