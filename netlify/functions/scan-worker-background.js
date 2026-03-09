const { getSupabaseAdminClient } = require('../../src/lib/supabase-admin')
const { runScan } = require('../../src/lib/scanner')

const WORKER_SECRET = process.env.INTERNAL_WORKER_SECRET
const HEARTBEAT_MS = 60 * 1000

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' }
  }

  if (!WORKER_SECRET || event.headers['x-worker-secret'] !== WORKER_SECRET) {
    return { statusCode: 401, body: 'Unauthorized' }
  }

  let body = {}
  try {
    body = JSON.parse(event.body || '{}')
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' }
  }

  const jobId = body.jobId
  if (!jobId) {
    return { statusCode: 400, body: 'jobId required' }
  }

  const supabase = getSupabaseAdminClient()

  // Load job
  const { data: job, error: jobError } = await supabase
    .from('scan_jobs')
    .select('*')
    .eq('id', jobId)
    .single()

  if (jobError || !job) {
    return { statusCode: 404, body: 'Job not found' }
  }

  if (job.status !== 'queued') {
    return { statusCode: 200, body: 'Job already handled' }
  }

  const nowIso = new Date().toISOString()
  const workerId = `worker-${Math.random().toString(36).slice(2, 10)}`

  // Mark running
  const { error: claimError } = await supabase
    .from('scan_jobs')
    .update({
      status: 'running',
      attempts: job.attempts + 1,
      started_at: job.started_at ?? nowIso,
      last_heartbeat: nowIso,
      worker_id: workerId,
      updated_at: nowIso,
    })
    .eq('id', jobId)
    .eq('status', 'queued')

  if (claimError) {
    return { statusCode: 500, body: 'Failed to claim job' }
  }

  // Set scan running
  await supabase
    .from('scans')
    .update({ status: 'running', started_at: nowIso })
    .eq('id', job.scan_id)

  // Keep heartbeat while running
  const heartbeat = setInterval(async () => {
    await supabase
      .from('scan_jobs')
      .update({ last_heartbeat: new Date().toISOString() })
      .eq('id', jobId)
  }, HEARTBEAT_MS)

  try {
    // Run scan
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('*')
      .eq('id', job.company_id)
      .single()

    if (companyError || !company) {
      throw new Error('Company not found for job')
    }

    // Replace-on-rerun: delete prior data (keep this scan id)
    await deletePriorData(supabase, job.company_id, job.scan_id)

    // Use service role key as bearer for Supabase client inside runScan
    const serviceToken = process.env.SUPABASE_SERVICE_ROLE_KEY
    await runScan(job.scan_id, company, serviceToken)

    const finishedAt = new Date().toISOString()

    await supabase
      .from('scan_jobs')
      .update({
        status: 'completed',
        last_heartbeat: finishedAt,
        completed_at: finishedAt,
        updated_at: finishedAt,
      })
      .eq('id', jobId)
  } catch (err) {
    const finishedAt = new Date().toISOString()
    const msg = err instanceof Error ? err.message : 'Scan failed'

    await supabase
      .from('scans')
      .update({ status: 'failed', error: msg, completed_at: finishedAt })
      .eq('id', job.scan_id)

    await supabase
      .from('scan_jobs')
      .update({
        status: 'failed',
        error: msg,
        last_heartbeat: finishedAt,
        completed_at: finishedAt,
        updated_at: finishedAt,
      })
      .eq('id', jobId)
  } finally {
    clearInterval(heartbeat)
  }

  return { statusCode: 200, body: 'ok' }
}

async function deletePriorData(supabase, companyId, keepScanId) {
  // Delete insights/content_items/scans except the current scan
  await supabase.from('insights').delete().eq('company_id', companyId).neq('scan_id', keepScanId)
  await supabase.from('content_items').delete().eq('company_id', companyId).neq('scan_id', keepScanId)
  await supabase.from('scans').delete().eq('company_id', companyId).neq('id', keepScanId)
}
