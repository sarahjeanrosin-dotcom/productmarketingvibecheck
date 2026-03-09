const { getSupabaseAdminClient } = require('../../src/lib/supabase-admin')
const { runScan } = require('../../src/lib/scanner')

const WORKER_SECRET = process.env.INTERNAL_WORKER_SECRET
const HEARTBEAT_MS = 60 * 1000
const MAX_JOBS = parseInt(process.env.SCAN_WORKER_MAX_JOBS || '1', 10)

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' }
  }

  if (!WORKER_SECRET || event.headers['x-worker-secret'] !== WORKER_SECRET) {
    return { statusCode: 401, body: 'Unauthorized' }
  }

  const supabase = getSupabaseAdminClient()

  let processed = 0
  while (processed < MAX_JOBS) {
    const job = await claimNextJob(supabase)
    if (!job) break
    processed++
    await processJob(supabase, job)
  }

  return { statusCode: 200, body: JSON.stringify({ processed }) }
}

async function claimNextJob(supabase) {
  const { data: candidate, error } = await supabase
    .from('scan_jobs')
    .select('*')
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error && error.code !== 'PGRST116') {
    console.warn('Claim select error:', error.message)
    return null
  }
  if (!candidate) return null

  const nowIso = new Date().toISOString()
  const workerId = `worker-${Math.random().toString(36).slice(2, 10)}`

  const { data: claimed, error: updateError } = await supabase
    .from('scan_jobs')
    .update({
      status: 'running',
      attempts: candidate.attempts + 1,
      started_at: candidate.started_at ?? nowIso,
      last_heartbeat: nowIso,
      worker_id: workerId,
      updated_at: nowIso,
    })
    .eq('id', candidate.id)
    .eq('status', 'queued')
    .select()
    .single()

  if (updateError) {
    console.warn('Claim update error:', updateError.message)
    return null
  }

  return claimed
}

async function processJob(supabase, job) {
  const jobId = job.id
  const heartbeat = setInterval(async () => {
    await supabase
      .from('scan_jobs')
      .update({ last_heartbeat: new Date().toISOString() })
      .eq('id', jobId)
  }, HEARTBEAT_MS)

  try {
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('*')
      .eq('id', job.company_id)
      .single()

    if (companyError || !company) {
      throw new Error('Company not found for job')
    }

    await deletePriorData(supabase, job.company_id, job.scan_id)

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
}

async function deletePriorData(supabase, companyId, keepScanId) {
  // Delete insights/content_items/scans except the current scan
  await supabase.from('insights').delete().eq('company_id', companyId).neq('scan_id', keepScanId)
  await supabase.from('content_items').delete().eq('company_id', companyId).neq('scan_id', keepScanId)
  await supabase.from('scans').delete().eq('company_id', companyId).neq('id', keepScanId)
}
