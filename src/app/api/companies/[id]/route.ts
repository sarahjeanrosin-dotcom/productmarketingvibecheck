import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { requireActiveSubscription } from '@/lib/auth-server'
import type { UpdateCompanyInput } from '@/lib/types'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { accessToken, errorResponse } = await requireActiveSubscription(req)
  if (errorResponse) return errorResponse

  const { id } = await params
  const db = createServerClient(accessToken ?? undefined)

  const { data, error } = await db
    .from('companies')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: error.code === 'PGRST116' ? 404 : 500 })
  }

  return NextResponse.json(data)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { accessToken, errorResponse } = await requireActiveSubscription(req)
  if (errorResponse) return errorResponse

  const { id } = await params
  const db = createServerClient(accessToken ?? undefined)

  let body: UpdateCompanyInput
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}
  if (body.name !== undefined) updates.name = body.name.trim()
  if (body.domain !== undefined) updates.domain = body.domain?.trim() || null
  if (body.include_keywords !== undefined) updates.include_keywords = body.include_keywords
  if (body.exclude_keywords !== undefined) updates.exclude_keywords = body.exclude_keywords
  if (body.allowed_domains !== undefined) updates.allowed_domains = body.allowed_domains?.length ? body.allowed_domains : null
  if (body.blocked_domains !== undefined) updates.blocked_domains = body.blocked_domains?.length ? body.blocked_domains : null
  if (body.source_config !== undefined) {
    // Merge with existing config
    const existing = await db.from('companies').select('source_config').eq('id', id).single()
    updates.source_config = { ...(existing.data?.source_config ?? {}), ...body.source_config }
  }

  const { data, error } = await db
    .from('companies')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { accessToken, errorResponse } = await requireActiveSubscription(req)
  if (errorResponse) return errorResponse

  const { id } = await params
  const db = createServerClient(accessToken ?? undefined)

  const { error } = await db
    .from('companies')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return new NextResponse(null, { status: 204 })
}
