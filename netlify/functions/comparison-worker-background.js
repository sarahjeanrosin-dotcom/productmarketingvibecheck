const { createClient } = require('@supabase/supabase-js')
const { generateComparison } = require('../../src/lib/compare')

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' }
  }

  let body
  try {
    body = JSON.parse(event.body || '{}')
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' }
  }

  const { comparisonId } = body
  if (!comparisonId) {
    return { statusCode: 400, body: 'comparisonId required' }
  }

  const supabase = getSupabaseClient()

  try {
    const { data: comparison, error: compError } = await supabase
      .from('comparisons')
      .select('*')
      .eq('id', comparisonId)
      .single()

    if (compError || !comparison) {
      console.error('Comparison not found:', comparisonId)
      return { statusCode: 404, body: 'Comparison not found' }
    }

    const [{ data: companyA }, { data: companyB }] = await Promise.all([
      supabase.from('companies').select('*').eq('id', comparison.company_a_id).single(),
      supabase.from('companies').select('*').eq('id', comparison.company_b_id).single(),
    ])

    if (!companyA || !companyB) throw new Error('Could not load companies')

    const [{ data: insightA }, { data: insightB }, { data: itemsA }, { data: itemsB }] = await Promise.all([
      supabase.from('insights').select('*').eq('scan_id', comparison.scan_a_id).single(),
      supabase.from('insights').select('*').eq('scan_id', comparison.scan_b_id).single(),
      supabase.from('content_items').select('*').eq('scan_id', comparison.scan_a_id),
      supabase.from('content_items').select('*').eq('scan_id', comparison.scan_b_id),
    ])

    if (!insightA || !insightB) throw new Error('Could not load insights')

    const { summary_md, comparison_json } = await generateComparison(
      companyA.name,
      companyB.name,
      insightA.insights_json,
      insightB.insights_json,
      itemsA || [],
      itemsB || []
    )

    await supabase
      .from('comparisons')
      .update({ summary_md, comparison_json, status: 'completed' })
      .eq('id', comparisonId)

    return { statusCode: 200, body: JSON.stringify({ success: true }) }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('Comparison worker failed:', msg)
    await supabase
      .from('comparisons')
      .update({ status: 'failed' })
      .eq('id', comparisonId)
    return { statusCode: 500, body: msg }
  }
}
