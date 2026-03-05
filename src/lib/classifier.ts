// Content classification using Anthropic with URL heuristics as fallback

import Anthropic from '@anthropic-ai/sdk'
import type { ContentType, ContentCategory, ContentSource } from './types'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface ClassificationResult {
  content_type: ContentType
  category: ContentCategory
  confidence: number
  source: ContentSource
  platform: string | null
  location: string | null
}

// ============================================================
// Heuristic-based classification (fast, no API call)
// ============================================================

export function detectSourceFromUrl(url: string): ContentSource {
  const lower = url.toLowerCase()
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) return 'youtube'
  if (lower.includes('reddit.com')) return 'reddit'
  return 'web'
}

export function detectPlatformFromUrl(url: string): string | null {
  const lower = url.toLowerCase()
  try {
    const { hostname } = new URL(url)
    if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) return 'youtube'
    if (hostname.includes('reddit.com')) return 'reddit'
    if (hostname.includes('g2.com')) return 'g2'
    if (hostname.includes('capterra.com')) return 'capterra'
    if (hostname.includes('trustpilot.com')) return 'trustpilot'
    if (hostname.includes('producthunt.com')) return 'producthunt'
    if (hostname.includes('getapp.com')) return 'getapp'
    if (hostname.includes('softwareadvice.com')) return 'softwareadvice'
    if (hostname.includes('gartner.com')) return 'gartner'
    return hostname.replace('www.', '')
  } catch {
    return null
  }
}

export function heuristicClassify(url: string, title: string): {
  content_type: ContentType
  category: ContentCategory
  confidence: number
} {
  const lower = url.toLowerCase()
  const lowerTitle = title.toLowerCase()

  // YouTube
  if (lower.includes('youtube.com/watch') || lower.includes('youtu.be/')) {
    return { content_type: 'video', category: 'product_marketing', confidence: 0.9 }
  }

  // Reddit
  if (lower.includes('reddit.com/r/')) {
    return { content_type: 'review', category: 'review', confidence: 0.85 }
  }

  // PDF
  if (lower.endsWith('.pdf') || lower.includes('/pdf/') || lowerTitle.includes('pdf')) {
    return { content_type: 'pdf', category: 'sales_asset', confidence: 0.85 }
  }

  // Press release
  if (
    lower.includes('/press/') ||
    lower.includes('/press-release') ||
    lower.includes('/news/') ||
    lower.includes('/newsroom/') ||
    lowerTitle.includes('press release') ||
    lowerTitle.includes('announces') ||
    lowerTitle.includes('announcement')
  ) {
    return { content_type: 'press', category: 'pr', confidence: 0.8 }
  }

  // Blog
  if (
    lower.includes('/blog/') ||
    lower.includes('/posts/') ||
    lower.includes('/articles/') ||
    lower.includes('/insights/') ||
    lower.includes('/resources/')
  ) {
    return { content_type: 'blog', category: 'product_marketing', confidence: 0.75 }
  }

  // Review sites
  if (
    lower.includes('g2.com') ||
    lower.includes('capterra.com') ||
    lower.includes('trustpilot.com') ||
    lower.includes('getapp.com') ||
    lower.includes('softwareadvice.com')
  ) {
    return { content_type: 'review', category: 'review', confidence: 0.9 }
  }

  // Product page heuristics
  if (
    lower.includes('/product') ||
    lower.includes('/feature') ||
    lower.includes('/solution') ||
    lower.includes('/platform') ||
    lower.includes('/pricing') ||
    lowerTitle.includes('pricing') ||
    lowerTitle.includes('features')
  ) {
    return { content_type: 'product', category: 'product_marketing', confidence: 0.7 }
  }

  // Landing page heuristics (homepages, campaign pages)
  if (
    lower.match(/^https?:\/\/[^/]+\/?$/) || // root URL
    lower.includes('/lp/') ||
    lower.includes('/landing/') ||
    lower.includes('/campaign/')
  ) {
    return { content_type: 'landing', category: 'sales_asset', confidence: 0.7 }
  }

  return { content_type: 'other', category: 'other', confidence: 0.4 }
}

// ============================================================
// LLM-based batch classification
// ============================================================

interface ItemForClassification {
  url: string
  title: string
  snippet: string
}

interface LLMClassification {
  content_type: ContentType
  category: ContentCategory
  confidence: number
}

export async function classifyBatch(
  items: ItemForClassification[]
): Promise<LLMClassification[]> {
  if (items.length === 0) return []

  const prompt = `You are classifying content items found during a competitor/product marketing analysis.

For each item below, classify:
- content_type: one of: landing, product, blog, pdf, press, review, video, social, other
- category: one of: sales_asset, product_marketing, pr, review, other
- confidence: 0.0–1.0

Definitions:
- landing: homepage or campaign landing page
- product: product/feature/solutions/pricing page
- blog: blog post, article, thought leadership
- pdf: PDF document, whitepaper, ebook, datasheet
- press: press release, news announcement
- review: review site listing (G2, Capterra, Reddit, etc.)
- video: YouTube or other video
- social: social media post

- sales_asset: content used to sell (landing, product, pdf, pricing)
- product_marketing: content that markets/explains the product (blog, webinar, case study)
- pr: press releases, news, media coverage
- review: user reviews, community discussion
- other: anything that doesn't fit

Items:
${items.map((item, i) => `[${i}] URL: ${item.url}\nTitle: ${item.title}\nSnippet: ${item.snippet?.slice(0, 200) ?? ''}`).join('\n\n')}

Respond ONLY with a JSON array, one object per item, in order:
[{"content_type": "...", "category": "...", "confidence": 0.9}, ...]`

  try {
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = msg.content[0].type === 'text' ? msg.content[0].text : ''
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) throw new Error('No JSON array in response')

    const parsed: LLMClassification[] = JSON.parse(jsonMatch[0])
    if (!Array.isArray(parsed) || parsed.length !== items.length) {
      throw new Error('Response length mismatch')
    }

    return parsed.map((p) => ({
      content_type: p.content_type ?? 'other',
      category: p.category ?? 'other',
      confidence: typeof p.confidence === 'number' ? p.confidence : 0.5,
    }))
  } catch (err) {
    console.warn('LLM classification failed, using heuristics:', err)
    // Fallback to heuristics for all items
    return items.map((item) => heuristicClassify(item.url, item.title))
  }
}

// ============================================================
// Location extraction
// ============================================================

export function extractLocation(url: string): string | null {
  try {
    const { hostname, pathname } = new URL(url)
    if (hostname.includes('reddit.com')) {
      const match = pathname.match(/\/r\/([^/]+)/)
      return match ? `r/${match[1]}` : hostname
    }
    if (hostname.includes('youtube.com')) {
      const match = pathname.match(/\/channel\/([^/]+)|\/c\/([^/]+)|\/user\/([^/]+)/)
      return match ? match[1] ?? match[2] ?? match[3] : 'YouTube'
    }
    return hostname.replace('www.', '') + pathname.split('/').slice(0, 2).join('/')
  } catch {
    return null
  }
}
