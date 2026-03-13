const { getSupabaseAdminClient } = require('../../src/lib/supabase-admin')

const WORKER_SECRET = process.env.INTERNAL_WORKER_SECRET
const STALE_MINUTES = 15

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' }
  }

  if (!WORKER_SECRET || event.headers['x-worker-secret'] !== WORKER_SECRET) {
    return { statusCode: 401, body: 'Unauthorized' }
  }

  const supabase = getSupabaseAdminClient()

  const { data: staleJobs, error } = await supabase
    .from('scan_jobs')
    .select('id, scan_id, last_heartbeat, status')
    .eq('status', 'running')
    .lte('last_heartbeat', new Date(Date.now() - STALE_MINUTES * 60 * 1000).toISOString())

  if (error) {
    return { statusCode: 500, body: error.message }
  }

  const finishedAt = new Date().toISOString()
  for (const job of staleJobs ?? []) {
    await supabase
      .from('scan_jobs')
      .update({
        status: 'failed',
        error: 'Stale job reaped',
        completed_at: finishedAt,
        updated_at: finishedAt,
      })
      .eq('id', job.id)

    await supabase
      .from('scans')
      .update({
        status: 'failed',
        error: 'Stale job reaped',
        completed_at: finishedAt,
      })
      .eq('id', job.scan_id)
  }

  return { statusCode: 200, body: JSON.stringify({ reaped: staleJobs?.length ?? 0 }) }
}
