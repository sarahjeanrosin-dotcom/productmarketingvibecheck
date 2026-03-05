import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import type { CreateCompanyInput } from '@/lib/types'
import { DEFAULT_EXCLUDE_KEYWORDS } from '@/lib/types'

export async function GET() {
  const db = createServerClient()
  const { data, error } = await db
    .from('companies')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const db = createServerClient()

  let body: CreateCompanyInput
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'Company name is required' }, { status: 400 })
  }

  const sourceConfig = {
    web: true,
    youtube: true,
    reddit: true,
    social: false,
    max_items: 200,
    max_iterations: 12,
    ...body.source_config,
  }

  const { data, error } = await db
    .from('companies')
    .insert({
      name: body.name.trim(),
      domain: body.domain?.trim() || null,
      include_keywords: body.include_keywords?.length ? body.include_keywords : null,
      exclude_keywords: body.exclude_keywords?.length ? body.exclude_keywords : DEFAULT_EXCLUDE_KEYWORDS,
      source_config: sourceConfig,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
