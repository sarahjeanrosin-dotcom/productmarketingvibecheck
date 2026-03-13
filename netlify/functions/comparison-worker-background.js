const { getSupabaseAdminClient } = require('../../src/lib/supabase-admin')
const { generateComparison } = require('../../src/lib/compare')

const WORKER_SECRET = process.env.INTERNAL_WORKER_SECRET

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' }
  }

  if (!WORKER_SECRET || event.headers['x-worker-secret'] !== WORKER_SECRET) {
    return { statusCode: 401, body: 'Unauthorized' }
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

  const supabase = getSupabaseAdminClient()

  try {
    // Load the comparison record (has company/scan IDs)
    const { data: comparison, error: compError } = await supabase
      .from('comparisons')
      .select('*')
      .eq('id', comparisonId)
      .single()

    if (compError || !comparison) {
      console.error('Comparison not found:', comparisonId)
      return { statusCode: 404, body: 'Comparison not found' }
    }

    // Load companies
    const [{ data: companyA }, { data: companyB }] = await Promise.all([
      supabase.from('companies').select('*').eq('id', comparison.company_a_id).single(),
      supabase.from('companies').select('*').eq('id', comparison.company_b_id).single(),
    ])

    if (!companyA || !companyB) throw new Error('Could not load companies')

    // Load insights
    const [{ data: insightA }, { data: insightB }] = await Promise.all([
      supabase.from('insights').select('*').eq('scan_id', comparison.scan_a_id).single(),
      supabase.from('insights').select('*').eq('scan_id', comparison.scan_b_id).single(),
    ])

    if (!insightA || !insightB) throw new Error('Could not load insights')

    // Load content items
    const [{ data: itemsA }, { data: itemsB }] = await Promise.all([
      supabase.from('content_items').select('*').eq('scan_id', comparison.scan_a_id),
      supabase.from('content_items').select('*').eq('scan_id', comparison.scan_b_id),
    ])

    // Generate comparison via Anthropic
    const { summary_md, comparison_json } = await generateComparison(
      companyA.name,
      companyB.name,
      insightA.insights_json,
      insightB.insights_json,
      itemsA || [],
      itemsB || []
    )

    // Save results
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
