// ============================================================
// Domain types mirroring the Supabase schema
// ============================================================

export type ScanStatus = 'queued' | 'running' | 'completed' | 'failed'
export type ContentSource = 'web' | 'youtube' | 'reddit' | 'social'
export type ContentType = 'landing' | 'product' | 'blog' | 'pdf' | 'press' | 'review' | 'video' | 'social' | 'other'
export type ContentCategory = 'sales_asset' | 'product_marketing' | 'pr' | 'review' | 'other'

export interface SourceConfig {
  web: boolean
  youtube: boolean
  reddit: boolean
  social: boolean
  max_items: number
  max_iterations: number
}

export interface Company {
  id: string
  name: string
  domain: string | null
  include_keywords: string[] | null
  exclude_keywords: string[] | null
  source_config: SourceConfig
  created_at: string
}

export interface Scan {
  id: string
  company_id: string
  status: ScanStatus
  started_at: string | null
  completed_at: string | null
  stats: ScanStats | null
  error: string | null
  created_at: string
}

export interface ScanStats {
  total_items: number
  iterations: number
  duration_ms: number
  by_source: Record<ContentSource, number>
  by_type: Record<ContentType, number>
}

export interface ContentItem {
  id: string
  company_id: string
  scan_id: string
  url: string
  url_canonical: string
  url_hash: string
  title: string | null
  snippet: string | null
  source: ContentSource
  platform: string | null
  content_type: ContentType
  category: ContentCategory
  location: string | null
  published_at: string | null
  metrics: ItemMetrics | null
  classification_confidence: number | null
  raw_result: Record<string, unknown> | null
  created_at: string
}

export interface ItemMetrics {
  views?: number
  likes?: number
  comments?: number
}

export interface InsightsJson {
  primary_product_category: string
  icp_audience: string
  messaging_pillars: string[]
  themes_by_content_type: Record<string, string[]>
  competitive_notes: {
    emphasis: string[]
    proof_points: string[]
    positioning: string
    pricing_signals: string
  }
  top_evidence_links: Array<{
    url: string
    title: string
    reason: string
  }>
}

export interface Insight {
  id: string
  company_id: string
  scan_id: string
  summary_md: string
  insights_json: InsightsJson
  created_at: string
}

export interface Subscription {
  id: string
  user_id: string
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  stripe_price_id: string | null
  status: string
  current_period_end: string | null
  cancel_at_period_end: boolean
  created_at: string
  updated_at: string
}

// ============================================================
// API request / response shapes
// ============================================================

export interface CreateCompanyInput {
  name: string
  domain?: string
  include_keywords?: string[]
  exclude_keywords?: string[]
  source_config?: Partial<SourceConfig>
}

export interface UpdateCompanyInput extends Partial<CreateCompanyInput> {}

export interface StartScanResponse {
  scan_id: string
}

// Default exclusion patterns (lowercase substrings / regex patterns)
export const DEFAULT_EXCLUDE_KEYWORDS = [
  'careers',
  'jobs',
  'hiring',
  'legal',
  'privacy',
  'terms-of-service',
  'terms-and-conditions',
  '/tos',
  'investor-relations',
  'investors',
  'support',
  'help-center',
  'helpdesk',
  'knowledge-base',
  '/docs/',
  '/documentation/',
  'internal',
]

export const DEFAULT_EXCLUDE_URL_PATTERNS = [
  /\/careers\//i,
  /\/jobs\//i,
  /\/legal\//i,
  /\/privacy\//i,
  /\/terms\//i,
  /\/investors?\//i,
  /\/support\//i,
  /\/help\//i,
  /\/docs\//i,
  /\/documentation\//i,
  /\/knowledge-?base\//i,
]
