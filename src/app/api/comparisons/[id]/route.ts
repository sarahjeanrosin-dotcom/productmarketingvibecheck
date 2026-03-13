import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-server'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { accessToken, errorResponse } = await requireAuth(req)
  if (errorResponse) return errorResponse
  const { id } = await params
  const db = createServerClient(accessToken ?? undefined)

  const { data: comparison, error } = await db
    .from('comparisons')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: error.code === 'PGRST116' ? 404 : 500 })
  }

  // Enrich with company names
  const { data: companies } = await db
    .from('companies')
    .select('id, name')
    .in('id', [comparison.company_a_id, comparison.company_b_id])

  const nameMap: Record<string, string> = {}
  for (const co of companies ?? []) {
    nameMap[co.id] = co.name
  }

  return NextResponse.json({
    ...comparison,
    company_a_name: nameMap[comparison.company_a_id] ?? 'Unknown',
    company_b_name: nameMap[comparison.company_b_id] ?? 'Unknown',
  })
}
