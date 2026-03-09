exports.handler = async function () {
  const secret = process.env.INTERNAL_WORKER_SECRET
  const site = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL

  if (!secret || !site) {
    return { statusCode: 500, body: 'Missing INTERNAL_WORKER_SECRET or SITE_URL' }
  }

  try {
    await fetch(`${site}/.netlify/functions/scan-reaper`, {
      method: 'POST',
      headers: { 'x-worker-secret': secret },
    })
    return { statusCode: 200, body: 'ok' }
  } catch (err) {
    return { statusCode: 500, body: err instanceof Error ? err.message : 'Failed to call reaper' }
  }
}
