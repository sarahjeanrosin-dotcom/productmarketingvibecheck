// Generate strategic insights from collected content items using Anthropic

import Anthropic from '@anthropic-ai/sdk'
import type { ContentItem, InsightsJson } from './types'

let _client: Anthropic | null = null
function getClient() {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 60000 })
  return _client
}

function extractFirstJsonObject(text: string): string | null {
  // Remove markdown fences if present.
  const withoutFences = text.replace(/```json|```/gi, '').trim()
  const start = withoutFences.indexOf('{')
  if (start < 0) return null

  let depth = 0
  let inString = false
  let escaped = false

  for (let i = start; i < withoutFences.length; i++) {
    const ch = withoutFences[i]

    if (escaped) {
      escaped = false
      continue
    }

    if (ch === '\\') {
      escaped = true
      continue
    }

    if (ch === '"') {
      inString = !inString
      continue
    }

    if (inString) continue

    if (ch === '{') depth++
    if (ch === '}') depth--

    if (depth === 0) {
      return withoutFences.slice(start, i + 1)
    }
  }

  return null
}

// Summarize content items for the LLM (avoid huge context)
function summarizeItems(items: ContentItem[]): string {
  // Group by content type
  const byType: Record<string, ContentItem[]> = {}
  for (const item of items) {
    if (!byType[item.content_type]) byType[item.content_type] = []
    byType[item.content_type].push(item)
  }

  const lines: string[] = []
  for (const [type, typeItems] of Object.entries(byType)) {
    lines.push(`\n## ${type.toUpperCase()} (${typeItems.length} items)`)
    // Take up to 8 per type for context
    for (const item of typeItems.slice(0, 8)) {
      const title = item.title ?? '(no title)'
      const snippet = item.snippet ? ` — ${item.snippet.slice(0, 150)}` : ''
      lines.push(`- [${item.platform ?? 'web'}] ${title}${snippet}\n  URL: ${item.url}`)
    }
  }

  return lines.join('\n')
}

export async function generateInsights(
  companyName: string,
  items: ContentItem[]
): Promise<{ summary_md: string; insights_json: InsightsJson }> {
  const itemSummary = summarizeItems(items)
  const totalCount = items.length

  const prompt = `You are a product marketing analyst. You've collected ${totalCount} public content items about "${companyName}".

Analyze the content inventory below and produce a comprehensive strategic intelligence report.

CONTENT INVENTORY:
${itemSummary}

Produce a JSON object with these exact keys:
{
  "primary_product_category": "One-sentence description of what they sell",
  "icp_audience": "Best-guess ICP: job titles, company size, industry",
  "messaging_pillars": ["pillar 1", "pillar 2", "pillar 3", ...],
  "themes_by_content_type": {
    "blog": ["theme 1", "theme 2"],
    "product": ["theme 1"],
    "video": ["theme 1"],
    ... (only include types that have items)
  },
  "competitive_notes": {
    "emphasis": ["What they emphasize most in their messaging"],
    "proof_points": ["Customer logos mentioned", "metrics cited", "awards"],
    "positioning": "How they position vs alternatives",
    "pricing_signals": "Any pricing info found or 'Not visible in public content'"
  },
  "top_evidence_links": [
    {
      "url": "https://...",
      "title": "Page title",
      "reason": "Why this is a key evidence link"
    }
    // Include exactly 10 items, picking the most strategically interesting
  ]
}

Respond ONLY with the JSON object (no markdown fences).`

  let insights_json: InsightsJson

  try {
    const msg = await getClient().messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
    const jsonObject = extractFirstJsonObject(text)
    if (!jsonObject) {
      throw new Error('No JSON object found in model response')
    }
    insights_json = JSON.parse(jsonObject)
  } catch (err) {
    console.warn('Insights generation failed, using fallback:', err instanceof Error ? err.message : err)
    insights_json = buildFallbackInsights(companyName, items)
  }

  const summary_md = buildSummaryMarkdown(companyName, insights_json, totalCount)

  return { summary_md, insights_json }
}

function buildFallbackInsights(companyName: string, items: ContentItem[]): InsightsJson {
  const byType: Record<string, number> = {}
  for (const item of items) {
    byType[item.content_type] = (byType[item.content_type] ?? 0) + 1
  }

  return {
    primary_product_category: `${companyName} (analysis pending — LLM unavailable)`,
    icp_audience: 'Analysis unavailable',
    messaging_pillars: ['Analysis unavailable'],
    themes_by_content_type: Object.fromEntries(
      Object.keys(byType).map((t) => [t, ['Analysis unavailable']])
    ),
    competitive_notes: {
      emphasis: ['Analysis unavailable'],
      proof_points: [],
      positioning: 'Analysis unavailable',
      pricing_signals: 'Analysis unavailable',
    },
    top_evidence_links: items.slice(0, 10).map((item) => ({
      url: item.url,
      title: item.title ?? item.url,
      reason: 'Auto-selected (LLM unavailable)',
    })),
  }
}

function buildSummaryMarkdown(
  companyName: string,
  insights: InsightsJson,
  totalItems: number
): string {
  const lines = [
    `# ${companyName} — Content Intelligence Report`,
    '',
    `*${totalItems} content items analyzed*`,
    '',
    '## Primary Product / Category',
    insights.primary_product_category,
    '',
    '## ICP / Target Audience',
    insights.icp_audience,
    '',
    '## Messaging Pillars',
    ...insights.messaging_pillars.map((p) => `- ${p}`),
    '',
    '## Themes by Content Type',
    ...Object.entries(insights.themes_by_content_type).flatMap(([type, themes]) => [
      `### ${type.charAt(0).toUpperCase() + type.slice(1)}`,
      ...themes.map((t) => `- ${t}`),
    ]),
    '',
    '## Competitive Notes',
    '### What they emphasize',
    ...insights.competitive_notes.emphasis.map((e) => `- ${e}`),
    '',
    '### Proof points',
    ...insights.competitive_notes.proof_points.map((p) => `- ${p}`),
    '',
    `**Positioning:** ${insights.competitive_notes.positioning}`,
    '',
    `**Pricing signals:** ${insights.competitive_notes.pricing_signals}`,
    '',
    '## Top Evidence Links',
    ...insights.top_evidence_links.map(
      (l) => `- [${l.title}](${l.url}) — ${l.reason}`
    ),
  ]

  return lines.join('\n')
}
