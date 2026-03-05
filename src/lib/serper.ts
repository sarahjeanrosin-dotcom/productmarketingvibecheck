// Serper.dev API wrapper
// Handles web search and Reddit-focused search

const SERPER_API_URL = 'https://google.serper.dev/search'

export interface SerperResult {
  title: string
  link: string
  snippet: string
  date?: string
  position: number
  source?: string
}

export interface SerperResponse {
  organic: SerperResult[]
  answerBox?: { answer?: string; snippet?: string }
  knowledgeGraph?: Record<string, unknown>
}

async function serperSearch(query: string, options?: {
  num?: number
  gl?: string
  hl?: string
}): Promise<SerperResult[]> {
  const apiKey = process.env.SERPER_API_KEY
  if (!apiKey) throw new Error('SERPER_API_KEY not configured')

  const body = {
    q: query,
    num: options?.num ?? 10,
    gl: options?.gl ?? 'us',
    hl: options?.hl ?? 'en',
  }

  const res = await fetch(SERPER_API_URL, {
    method: 'POST',
    headers: {
      'X-API-KEY': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Serper API error ${res.status}: ${text}`)
  }

  const data: SerperResponse = await res.json()
  return data.organic ?? []
}

// Build a rotating set of web queries per iteration to maximize coverage
export function buildWebQueries(
  companyName: string,
  domain: string | null,
  iteration: number,
  includeKeywords: string[]
): string[] {
  const base = domain ? `site:${domain}` : `"${companyName}"`
  const brand = `"${companyName}"`

  const queryPool = [
    domain ? `site:${domain}` : `${brand} -site:linkedin.com`,
    `${brand} blog`,
    `${brand} press release`,
    `${brand} product`,
    `${brand} pricing`,
    `${brand} case study`,
    `${brand} whitepaper OR ebook OR pdf`,
    `${brand} landing page`,
    `${brand} webinar`,
    `${brand} announcement`,
    `${brand} feature update`,
    `${brand} customer story`,
    ...(domain ? [`${brand} -site:${domain}`] : []),
    ...includeKeywords.map(kw => `${brand} ${kw}`),
  ]

  // Each iteration picks a fresh batch (cycling)
  const startIdx = (iteration * 2) % queryPool.length
  return [
    queryPool[startIdx],
    queryPool[(startIdx + 1) % queryPool.length],
  ]
}

export function buildRedditQueries(companyName: string, iteration: number): string[] {
  const brand = `"${companyName}"`
  const queries = [
    `site:reddit.com ${brand}`,
    `site:reddit.com ${companyName} review`,
    `site:reddit.com ${companyName} alternative`,
    `site:reddit.com ${companyName} feedback`,
    `site:reddit.com ${companyName} experience`,
  ]
  const idx = iteration % queries.length
  return [queries[idx]]
}

export function buildReviewSiteQueries(companyName: string): string[] {
  return [
    `site:g2.com "${companyName}"`,
    `site:capterra.com "${companyName}"`,
    `site:trustpilot.com "${companyName}"`,
    `site:producthunt.com "${companyName}"`,
    `site:getapp.com "${companyName}"`,
  ]
}

export async function fetchWebResults(
  companyName: string,
  domain: string | null,
  iteration: number,
  includeKeywords: string[]
): Promise<SerperResult[]> {
  const queries = buildWebQueries(companyName, domain, iteration, includeKeywords)
  const results: SerperResult[] = []

  for (const q of queries) {
    try {
      const res = await serperSearch(q, { num: 10 })
      results.push(...res)
    } catch (err) {
      console.warn(`Web search failed for query "${q}":`, err)
    }
  }

  return results
}

export async function fetchRedditResults(
  companyName: string,
  iteration: number
): Promise<SerperResult[]> {
  const queries = buildRedditQueries(companyName, iteration)
  const results: SerperResult[] = []

  for (const q of queries) {
    try {
      const res = await serperSearch(q, { num: 10 })
      results.push(...res)
    } catch (err) {
      console.warn(`Reddit search failed for query "${q}":`, err)
    }
  }

  return results
}

export async function fetchReviewResults(companyName: string): Promise<SerperResult[]> {
  const queries = buildReviewSiteQueries(companyName)
  const results: SerperResult[] = []

  for (const q of queries) {
    try {
      const res = await serperSearch(q, { num: 5 })
      results.push(...res)
    } catch (err) {
      console.warn(`Review search failed for query "${q}":`, err)
    }
  }

  return results
}
