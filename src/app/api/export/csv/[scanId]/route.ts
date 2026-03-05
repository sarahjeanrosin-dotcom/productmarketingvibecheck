import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ scanId: string }> }
) {
  const { scanId } = await params
  const db = createServerClient()

  // Verify scan exists
  const { data: scan, error: scanError } = await db
    .from('scans')
    .select('id, company_id, status, completed_at, stats')
    .eq('id', scanId)
    .single()

  if (scanError || !scan) {
    return NextResponse.json({ error: 'Scan not found' }, { status: 404 })
  }

  // Fetch company name
  const { data: company } = await db
    .from('companies')
    .select('name')
    .eq('id', scan.company_id)
    .single()

  // Fetch content items
  const { data: items, error: itemsError } = await db
    .from('content_items')
    .select('*')
    .eq('scan_id', scanId)
    .order('content_type', { ascending: true })

  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 })
  }

  // Build CSV
  const headers = [
    'title',
    'url',
    'source',
    'platform',
    'content_type',
    'category',
    'location',
    'published_at',
    'classification_confidence',
    'views',
    'likes',
    'comments',
  ]

  const csvRows = [headers.join(',')]

  for (const item of items ?? []) {
    const row = [
      csvEscape(item.title ?? ''),
      csvEscape(item.url_canonical ?? item.url),
      csvEscape(item.source),
      csvEscape(item.platform ?? ''),
      csvEscape(item.content_type),
      csvEscape(item.category),
      csvEscape(item.location ?? ''),
      csvEscape(item.published_at ?? ''),
      item.classification_confidence != null ? item.classification_confidence.toFixed(2) : '',
      item.metrics?.views ?? '',
      item.metrics?.likes ?? '',
      item.metrics?.comments ?? '',
    ]
    csvRows.push(row.join(','))
  }

  const csv = csvRows.join('\n')
  const companyName = (company?.name ?? 'company').replace(/[^a-z0-9]/gi, '_').toLowerCase()
  const filename = `${companyName}_content_${new Date().toISOString().split('T')[0]}.csv`

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}

function csvEscape(value: string): string {
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}
