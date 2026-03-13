// AI-powered competitor comparison using Anthropic Sonnet

import Anthropic from '@anthropic-ai/sdk'
import type { ContentItem, InsightsJson, ComparisonJson } from './types'

let _client: Anthropic | null = null
function getClient() {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 90000 })
  return _client
}

function buildItemBreakdown(items: ContentItem[]): Record<string, number> {
  const breakdown: Record<string, number> = {}
  for (const item of items) {
    breakdown[item.content_type] = (breakdown[item.content_type] ?? 0) + 1
  }
  return breakdown
}

function buildSourceBreakdown(items: ContentItem[]): Record<string, number> {
  const breakdown: Record<string, number> = {}
  for (const item of items) {
    breakdown[item.source] = (breakdown[item.source] ?? 0) + 1
  }
  return breakdown
}

export async function generateComparison(
  companyAName: string,
  companyBName: string,
  insightsA: InsightsJson,
  insightsB: InsightsJson,
  itemsA: ContentItem[],
  itemsB: ContentItem[]
): Promise<{ summary_md: string; comparison_json: ComparisonJson }> {
  const breakdownA = buildItemBreakdown(itemsA)
  const breakdownB = buildItemBreakdown(itemsB)
  const sourceA = buildSourceBreakdown(itemsA)
  const sourceB = buildSourceBreakdown(itemsB)

  const prompt = `You are a senior product marketing strategist conducting a competitive analysis.

Compare these two companies based on their public content intelligence data.

=== COMPANY A: ${companyAName} ===
Total content items: ${itemsA.length}
Content breakdown by type: ${JSON.stringify(breakdownA)}
Content breakdown by source: ${JSON.stringify(sourceA)}
Product category: ${insightsA.primary_product_category}
ICP: ${insightsA.icp_audience}
Messaging pillars: ${JSON.stringify(insightsA.messaging_pillars)}
Themes by content type: ${JSON.stringify(insightsA.themes_by_content_type)}
Competitive notes:
  - Emphasis: ${JSON.stringify(insightsA.competitive_notes.emphasis)}
  - Proof points: ${JSON.stringify(insightsA.competitive_notes.proof_points)}
  - Positioning: ${insightsA.competitive_notes.positioning}
  - Pricing signals: ${insightsA.competitive_notes.pricing_signals}
Top evidence links: ${JSON.stringify(insightsA.top_evidence_links.slice(0, 5))}

=== COMPANY B: ${companyBName} ===
Total content items: ${itemsB.length}
Content breakdown by type: ${JSON.stringify(breakdownB)}
Content breakdown by source: ${JSON.stringify(sourceB)}
Product category: ${insightsB.primary_product_category}
ICP: ${insightsB.icp_audience}
Messaging pillars: ${JSON.stringify(insightsB.messaging_pillars)}
Themes by content type: ${JSON.stringify(insightsB.themes_by_content_type)}
Competitive notes:
  - Emphasis: ${JSON.stringify(insightsB.competitive_notes.emphasis)}
  - Proof points: ${JSON.stringify(insightsB.competitive_notes.proof_points)}
  - Positioning: ${insightsB.competitive_notes.positioning}
  - Pricing signals: ${insightsB.competitive_notes.pricing_signals}
Top evidence links: ${JSON.stringify(insightsB.top_evidence_links.slice(0, 5))}

Produce a competitive gap analysis JSON. Focus FIRST on messaging gaps (what each company says that the other doesn't, and what this reveals strategically). Then analyze the remaining dimensions.

Return this exact JSON structure:
{
  "messaging_gap_analysis": {
    "company_a_unique": ["messaging angle or theme only ${companyAName} uses", ...],
    "company_b_unique": ["messaging angle or theme only ${companyBName} uses", ...],
    "shared_themes": ["themes both companies address", ...],
    "gap_summary": "2-3 sentence narrative: what the messaging gap reveals, which company has the stronger/more differentiated narrative, and what the strategic implication is"
  },
  "icp_comparison": {
    "company_a": "${companyAName} ICP summary",
    "company_b": "${companyBName} ICP summary",
    "overlap": "Where their target audiences intersect",
    "divergence": "Where they are targeting different buyers or use cases"
  },
  "channel_presence": {
    "company_a_breakdown": ${JSON.stringify(breakdownA)},
    "company_b_breakdown": ${JSON.stringify(breakdownB)},
    "observations": ["Notable difference in channel/content-type mix and what it implies", ...]
  },
  "positioning_delta": {
    "company_a_positioning": "${companyAName} positioning in one sentence",
    "company_b_positioning": "${companyBName} positioning in one sentence",
    "key_differences": ["Specific differentiator 1", "Specific differentiator 2", ...]
  },
  "proof_points": {
    "company_a": ["Key proof points ${companyAName} uses", ...],
    "company_b": ["Key proof points ${companyBName} uses", ...],
    "gaps": ["Proof points one uses that the other is missing and could adopt", ...]
  },
  "pricing_signals": {
    "company_a": "${companyAName} pricing signal",
    "company_b": "${companyBName} pricing signal",
    "delta": "What the pricing difference reveals about their go-to-market strategy"
  },
  "strategic_opportunities": [
    "Concrete opportunity based on a gap identified above — be specific and actionable",
    ...
  ],
  "top_evidence_links": [
    {
      "company": "a",
      "url": "https://...",
      "title": "Page title",
      "reason": "Why this is a key piece of competitive evidence"
    }
    // Include 6-10 links total, mixing both companies, picking the most strategically revealing
  ]
}

Respond ONLY with the JSON object (no markdown fences).`

  let comparison_json: ComparisonJson

  try {
    const msg = await getClient().messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
    const clean = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
    comparison_json = JSON.parse(clean)
  } catch (err) {
    console.warn('Comparison generation failed, using fallback:', err)
    comparison_json = buildFallbackComparison(companyAName, companyBName, breakdownA, breakdownB)
  }

  const summary_md = buildComparisonMarkdown(companyAName, companyBName, comparison_json, itemsA.length, itemsB.length)

  return { summary_md, comparison_json }
}

function buildFallbackComparison(
  companyAName: string,
  companyBName: string,
  breakdownA: Record<string, number>,
  breakdownB: Record<string, number>
): ComparisonJson {
  return {
    messaging_gap_analysis: {
      company_a_unique: ['Analysis unavailable'],
      company_b_unique: ['Analysis unavailable'],
      shared_themes: [],
      gap_summary: 'AI analysis unavailable. Please try regenerating.',
    },
    icp_comparison: {
      company_a: 'Analysis unavailable',
      company_b: 'Analysis unavailable',
      overlap: 'Analysis unavailable',
      divergence: 'Analysis unavailable',
    },
    channel_presence: {
      company_a_breakdown: breakdownA,
      company_b_breakdown: breakdownB,
      observations: ['Analysis unavailable'],
    },
    positioning_delta: {
      company_a_positioning: 'Analysis unavailable',
      company_b_positioning: 'Analysis unavailable',
      key_differences: ['Analysis unavailable'],
    },
    proof_points: {
      company_a: [],
      company_b: [],
      gaps: ['Analysis unavailable'],
    },
    pricing_signals: {
      company_a: 'Analysis unavailable',
      company_b: 'Analysis unavailable',
      delta: 'Analysis unavailable',
    },
    strategic_opportunities: ['Analysis unavailable — please regenerate'],
    top_evidence_links: [],
  }
}

function buildComparisonMarkdown(
  companyAName: string,
  companyBName: string,
  c: ComparisonJson,
  totalA: number,
  totalB: number
): string {
  const lines = [
    `# ${companyAName} vs ${companyBName} — Competitive Analysis`,
    '',
    `*${companyAName}: ${totalA} content items analyzed · ${companyBName}: ${totalB} content items analyzed*`,
    '',
    '## Messaging Gap Analysis',
    c.messaging_gap_analysis.gap_summary,
    '',
    `### ${companyAName} unique messaging`,
    ...c.messaging_gap_analysis.company_a_unique.map((m) => `- ${m}`),
    '',
    `### ${companyBName} unique messaging`,
    ...c.messaging_gap_analysis.company_b_unique.map((m) => `- ${m}`),
    '',
    '### Shared themes',
    c.messaging_gap_analysis.shared_themes.length > 0
      ? c.messaging_gap_analysis.shared_themes.map((t) => `- ${t}`).join('\n')
      : '- None identified',
    '',
    '## ICP Comparison',
    `**${companyAName}:** ${c.icp_comparison.company_a}`,
    '',
    `**${companyBName}:** ${c.icp_comparison.company_b}`,
    '',
    `**Overlap:** ${c.icp_comparison.overlap}`,
    '',
    `**Divergence:** ${c.icp_comparison.divergence}`,
    '',
    '## Positioning Delta',
    `**${companyAName}:** ${c.positioning_delta.company_a_positioning}`,
    '',
    `**${companyBName}:** ${c.positioning_delta.company_b_positioning}`,
    '',
    '### Key differences',
    ...c.positioning_delta.key_differences.map((d) => `- ${d}`),
    '',
    '## Proof Points',
    `### ${companyAName}`,
    ...(c.proof_points.company_a.length ? c.proof_points.company_a.map((p) => `- ${p}`) : ['- None identified']),
    '',
    `### ${companyBName}`,
    ...(c.proof_points.company_b.length ? c.proof_points.company_b.map((p) => `- ${p}`) : ['- None identified']),
    '',
    '### Gaps (what one uses that the other is missing)',
    ...(c.proof_points.gaps.length ? c.proof_points.gaps.map((g) => `- ${g}`) : ['- None identified']),
    '',
    '## Pricing Signals',
    `**${companyAName}:** ${c.pricing_signals.company_a}`,
    `**${companyBName}:** ${c.pricing_signals.company_b}`,
    `**Delta:** ${c.pricing_signals.delta}`,
    '',
    '## Strategic Opportunities',
    ...c.strategic_opportunities.map((o) => `- ${o}`),
  ]

  return lines.join('\n')
}
