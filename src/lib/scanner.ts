// Main scan orchestration logic
// Iterative discovery → classification → insights → save

import { createServerClient } from './supabase'
import { fetchWebResults, fetchRedditResults, fetchReviewResults } from './serper'
import { fetchYouTubeVideos } from './youtube'
import { classifyBatch, detectSourceFromUrl, detectPlatformFromUrl, extractLocation, heuristicClassify } from './classifier'
import { generateInsights } from './insights'
import type {
  Company,
  ContentItem,
  ContentSource,
  ContentType,
  ContentCategory,
  DEFAULT_EXCLUDE_URL_PATTERNS,
} from './types'
import { DEFAULT_EXCLUDE_KEYWORDS } from './types'
import type { SerperResult } from './serper'
import type { YouTubeVideo } from './youtube'

// Import the patterns separately to avoid type-only export confusion
import { DEFAULT_EXCLUDE_URL_PATTERNS as EXCLUDE_PATTERNS } from './types'

// ============================================================
// URL utilities
// ============================================================

function canonicalizeUrl(url: string): string {
  try {
    const u = new URL(url)
    // Remove tracking params
    const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'ref', 'fbclid', 'gclid']
    trackingParams.forEach((p) => u.searchParams.delete(p))
    // Remove trailing slash from path (except root)
    if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
      u.pathname = u.pathname.slice(0, -1)
    }
    // Lowercase protocol + host
    return u.toString().replace(/^https?:\/\/www\./, 'https://')
  } catch {
    return url
  }
}

function hashUrl(url: string): string {
  // Simple deterministic hash for deduplication
  let hash = 0
  for (let i = 0; i < url.length; i++) {
    const char = url.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return Math.abs(hash).toString(36)
}

function isExcluded(url: string, extraKeywords: string[]): boolean {
  const lower = url.toLowerCase()

  // Check URL pattern exclusions
  for (const pattern of EXCLUDE_PATTERNS) {
    if (pattern.test(url)) return true
  }

  // Check keyword exclusions
  const allKeywords = [...DEFAULT_EXCLUDE_KEYWORDS, ...extraKeywords]
  for (const kw of allKeywords) {
    if (lower.includes(kw.toLowerCase())) return true
  }

  return false
}

// ============================================================
// Scanner
// ============================================================

interface ScanItem {
  url: string
  url_canonical: string
  url_hash: string
  title: string
  snippet: string
  source: ContentSource
  raw_result: Record<string, unknown>
  published_at: string | null
  metrics: { views?: number; likes?: number; comments?: number } | null
}

export async function runScan(scanId: string, company: Company, accessToken?: string): Promise<void> {
  const db = createServerClient(accessToken)
  const startTime = Date.now()

  const sourceConfig = company.source_config
  const maxItems = sourceConfig.max_items ?? 200
  const maxIterations = sourceConfig.max_iterations ?? 12
  const N_CONSECUTIVE = 2

  const includeKeywords = company.include_keywords ?? []
  const excludeKeywords = company.exclude_keywords ?? []

  // Update scan to running
  await db.from('scans').update({
    status: 'running',
    started_at: new Date().toISOString(),
  }).eq('id', scanId)

  const seenHashes = new Set<string>()
  const allItems: ScanItem[] = []
  let noNewCount = 0
  let iteration = 0

  // ---- Iterative discovery ----
  while (
    iteration < maxIterations &&
    allItems.length < maxItems &&
    noNewCount < N_CONSECUTIVE
  ) {
    const newItemsBefore = allItems.length

    // Fetch from enabled sources
    const fetchPromises: Promise<void>[] = []

    if (sourceConfig.web) {
      fetchPromises.push(
        fetchWebResults(company.name, company.domain, iteration, includeKeywords).then((results) => {
          for (const r of results) {
            addSerperResult(r, 'web', seenHashes, allItems, excludeKeywords)
            if (allItems.length >= maxItems) break
          }
        }).catch((err) => console.warn('Web fetch error:', err))
      )
    }

    if (sourceConfig.reddit) {
      fetchPromises.push(
        fetchRedditResults(company.name, iteration).then((results) => {
          for (const r of results) {
            addSerperResult(r, 'reddit', seenHashes, allItems, excludeKeywords)
            if (allItems.length >= maxItems) break
          }
        }).catch((err) => console.warn('Reddit fetch error:', err))
      )
    }

    // Fetch review sites only in first two iterations
    if (iteration < 2) {
      fetchPromises.push(
        fetchReviewResults(company.name).then((results) => {
          for (const r of results) {
            addSerperResult(r, 'web', seenHashes, allItems, excludeKeywords)
            if (allItems.length >= maxItems) break
          }
        }).catch((err) => console.warn('Review fetch error:', err))
      )
    }

    // YouTube only in first iteration
    if (sourceConfig.youtube && iteration === 0) {
      fetchPromises.push(
        fetchYouTubeVideos(company.name, 25).then((videos) => {
          for (const v of videos) {
            addYouTubeVideo(v, seenHashes, allItems)
            if (allItems.length >= maxItems) break
          }
        }).catch((err) => console.warn('YouTube fetch error:', err))
      )
    }

    await Promise.allSettled(fetchPromises)

    const newItemsAfter = allItems.length
    const foundNew = newItemsAfter - newItemsBefore

    if (foundNew === 0) {
      noNewCount++
    } else {
      noNewCount = 0
    }

    iteration++
  }

  // Trim to max_items
  const itemsToProcess = allItems.slice(0, maxItems)

  // ---- Classification ----
  // Batch classify in groups of 20 to avoid huge prompts
  const BATCH_SIZE = 20
  const classificationInput = itemsToProcess.map((item) => ({
    url: item.url_canonical,
    title: item.title,
    snippet: item.snippet,
  }))

  const batches: typeof classificationInput[] = []
  for (let i = 0; i < classificationInput.length; i += BATCH_SIZE) {
    batches.push(classificationInput.slice(i, i + BATCH_SIZE))
  }
  const batchResults = await Promise.all(batches.map((batch) => classifyBatch(batch)))
  const classifications: Array<{
    content_type: ContentType
    category: ContentCategory
    confidence: number
  }> = batchResults.flat()

  // ---- Save content items ----
  const contentItemRows = itemsToProcess.map((item, i) => {
    const cls = classifications[i] ?? heuristicClassify(item.url_canonical, item.title)
    return {
      company_id: company.id,
      scan_id: scanId,
      url: item.url,
      url_canonical: item.url_canonical,
      url_hash: item.url_hash,
      title: item.title || null,
      snippet: item.snippet || null,
      source: item.source,
      platform: detectPlatformFromUrl(item.url_canonical),
      content_type: cls.content_type,
      category: cls.category,
      location: extractLocation(item.url_canonical),
      published_at: item.published_at,
      metrics: item.metrics,
      classification_confidence: cls.confidence,
      raw_result: item.raw_result,
    }
  })

  // Upsert in batches (handle url_hash conflicts gracefully)
  const INSERT_BATCH = 50
  const savedItems: ContentItem[] = []

  for (let i = 0; i < contentItemRows.length; i += INSERT_BATCH) {
    const batch = contentItemRows.slice(i, i + INSERT_BATCH)
    const { data, error } = await db
      .from('content_items')
      .upsert(batch, { onConflict: 'company_id,url_hash', ignoreDuplicates: false })
      .select()

    if (error) {
      console.warn('Error inserting content items batch:', error.message)
    } else if (data) {
      savedItems.push(...data)
    }
  }

  // ---- Generate insights ----
  let insightsSaved = false
  try {
    const { summary_md, insights_json } = await generateInsights(company.name, savedItems)
    await db.from('insights').insert({
      company_id: company.id,
      scan_id: scanId,
      summary_md,
      insights_json,
    })
    insightsSaved = true
  } catch (err) {
    console.warn('Failed to generate insights:', err)
  }

  // ---- Build stats ----
  const bySource: Record<string, number> = {}
  const byType: Record<string, number> = {}
  for (const row of contentItemRows) {
    bySource[row.source] = (bySource[row.source] ?? 0) + 1
    byType[row.content_type] = (byType[row.content_type] ?? 0) + 1
  }

  const stats = {
    total_items: contentItemRows.length,
    iterations: iteration,
    duration_ms: Date.now() - startTime,
    by_source: bySource,
    by_type: byType,
    insights_generated: insightsSaved,
  }

  // ---- Mark scan complete ----
  await db.from('scans').update({
    status: 'completed',
    completed_at: new Date().toISOString(),
    stats,
  }).eq('id', scanId)
}

// ============================================================
// Helpers
// ============================================================

function addSerperResult(
  result: SerperResult,
  defaultSource: ContentSource,
  seenHashes: Set<string>,
  allItems: ScanItem[],
  excludeKeywords: string[]
): void {
  if (!result.link) return
  if (isExcluded(result.link, excludeKeywords)) return

  const canonical = canonicalizeUrl(result.link)
  const hash = hashUrl(canonical)

  if (seenHashes.has(hash)) return
  seenHashes.add(hash)

  const source = detectSourceFromUrl(canonical) ?? defaultSource

  allItems.push({
    url: result.link,
    url_canonical: canonical,
    url_hash: hash,
    title: result.title ?? '',
    snippet: result.snippet ?? '',
    source,
    raw_result: result as unknown as Record<string, unknown>,
    published_at: result.date ? (() => { try { const d = new Date(result.date!); return isNaN(d.getTime()) ? null : d.toISOString() } catch { return null } })() : null,
    metrics: null,
  })
}

function addYouTubeVideo(
  video: YouTubeVideo,
  seenHashes: Set<string>,
  allItems: ScanItem[]
): void {
  const canonical = canonicalizeUrl(video.url)
  const hash = hashUrl(canonical)

  if (seenHashes.has(hash)) return
  seenHashes.add(hash)

  allItems.push({
    url: video.url,
    url_canonical: canonical,
    url_hash: hash,
    title: video.title,
    snippet: video.description.slice(0, 500),
    source: 'youtube',
    raw_result: video as unknown as Record<string, unknown>,
    published_at: video.publishedAt ? new Date(video.publishedAt).toISOString() : null,
    metrics: {
      views: video.viewCount,
      likes: video.likeCount,
      comments: video.commentCount,
    },
  })
}

// ============================================================
// Pre-scan cleanup (replace-on-rerun)
// ============================================================

export async function deleteCompanyData(companyId: string, accessToken?: string): Promise<void> {
  const db = createServerClient(accessToken)

  // Cascade deletes via FK: deleting scans cascades to content_items and insights
  // But to be explicit:
  await db.from('insights').delete().eq('company_id', companyId)
  await db.from('content_items').delete().eq('company_id', companyId)
  await db.from('scans').delete().eq('company_id', companyId)
}
