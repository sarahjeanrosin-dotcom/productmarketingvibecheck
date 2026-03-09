# Content Intelligence Micro-App — CLAUDE.md

Internal tool for Product Marketing to collect, classify, and analyze public content about companies (competitors or targets).

## Stack

- **Framework**: Next.js 16 (App Router, TypeScript), React 19
- **Database**: Supabase (PostgreSQL via `@supabase/supabase-js` v2)
- **AI**: Anthropic SDK v0.39 — `claude-haiku-4-5-20251001` for classification, `claude-sonnet-4-6` for insights
- **Search**: Serper.dev (web + Reddit + reviews), YouTube Data API v3
- **PDF**: `pdf-lib` v1.17 (server-side rendering)
- **Styling**: Tailwind CSS v3
- **Deploy**: Netlify (`@netlify/plugin-nextjs`)

## Project structure

```
src/
  app/
    page.tsx                          # Redirects to /companies
    layout.tsx                        # Root layout with nav header
    globals.css                       # Tailwind + component classes (.btn, .input, .card, .badge)
    companies/
      page.tsx                        # Company list grid with source badges
      new/page.tsx                    # Create company form (name, domain, keywords, source toggles)
      [id]/page.tsx                   # Company detail: scan control, stats, results, insights
    api/
      companies/route.ts              # GET /api/companies, POST /api/companies
      companies/[id]/route.ts         # GET, PATCH, DELETE /api/companies/:id
      scans/route.ts                  # GET ?company_id=, POST (starts scan, maxDuration=300s)
      export/csv/[scanId]/route.ts    # GET — download 12-column CSV of content items
      export/pdf/[scanId]/route.ts    # GET — download PDF report (pdf-lib, A4)
  components/
    ScanStatusPanel.tsx               # Scan status badge, stats grid, content-type breakdown
    ResultsTable.tsx                  # Filterable/paginated content item table (25/page)
    InsightsPanel.tsx                 # Collapsible strategic insights display
  lib/
    types.ts                          # All TypeScript types + DEFAULT_EXCLUDE_KEYWORDS/PATTERNS
    supabase.ts                       # Supabase client factory (V1: single anon client)
    serper.ts                         # Serper.dev API wrapper (web + reddit + reviews)
    youtube.ts                        # YouTube Data API v3 wrapper (search + stats)
    classifier.ts                     # LLM + heuristic URL classification
    insights.ts                       # Anthropic insights generation (Sonnet)
    scanner.ts                        # Main scan orchestration
supabase/
  migrations/
    001_initial.sql                   # Full DB schema (companies, scans, content_items, insights)
```

## Environment variables

Copy `.env.local.example` to `.env.local` and fill in:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
ANTHROPIC_API_KEY=
SERPER_API_KEY=
YOUTUBE_API_KEY=
```

## Development

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # Production build
npm run lint       # ESLint
```

## Database setup

Run `supabase/migrations/001_initial.sql` in your Supabase SQL editor. The schema creates:
- `companies` — name, domain, include_keywords[], exclude_keywords[], source_config JSONB
- `scans` — scan runs with status enum, stats JSONB, started_at/completed_at timestamps
- `content_items` — classified URLs with url_hash unique per company; upserted on re-scan
- `insights` — AI-generated strategic insights JSON per scan

**Enums**: `scan_status` (queued/running/completed/failed), `content_source` (web/youtube/reddit/social), `content_type_enum`, `content_category`

RLS is disabled in V1. Enable it in V2 when adding Supabase Auth.

## Scan lifecycle

1. **POST /api/scans** with `{ company_id }`:
   - Deletes prior scans/items/insights for that company (replace-on-rerun)
   - Creates scan record with status `queued`
   - Runs `runScan()` synchronously (maxDuration=300s for Netlify)
   - Returns the completed scan object

2. **`runScan()`** in `src/lib/scanner.ts`:
   - Iterative URL discovery via Serper (web + Reddit + reviews) and YouTube
   - **Stop conditions**: 2 consecutive iterations with no new URLs, or `max_items` reached (default 200), or `max_iterations` (default 12)
   - Batch classification via Anthropic Haiku (20 items/batch); falls back to URL heuristics on any error
   - Upserts `content_items` to Supabase by `(company_id, url_hash)`
   - Generates insights via Anthropic Sonnet
   - Updates scan to `completed` with final stats

3. **Client polls** `GET /api/scans?company_id=` every 3 seconds while status is `running` or `queued`

## Classification

Heuristics in `src/lib/classifier.ts` detect via URL patterns and domain matching:
- `content_type`: landing, product, blog, pdf, press, review, video, social, other
- `category`: sales_asset, product_marketing, pr, review, other
- `platform`: youtube, reddit, g2, capterra, trustpilot, etc.

LLM classification uses Haiku in batches of 20 with structured prompt. Falls back to heuristics on any error.

## Exclusions

Default excluded URL patterns (defined in `src/lib/types.ts` as `DEFAULT_EXCLUDE_KEYWORDS` and `DEFAULT_EXCLUDE_PATTERNS`):
- Careers/jobs, legal/privacy/terms, investor relations, support/help/docs

Users can add extra `exclude_keywords` per company in the UI or via PATCH /api/companies/:id.

## Exports

- **CSV** (`/api/export/csv/[scanId]`): 12 columns — `title, url, source, platform, content_type, category, location, published_at, classification_confidence, views, likes, comments`
- **PDF** (`/api/export/pdf/[scanId]`): A4 report built with `pdf-lib` — cover page, scan stats, executive summary (product category, ICP, messaging pillars), competitive notes (emphasis, proof points, positioning, pricing signals), top evidence links, content item breakdown (type counts + top 50 links), page numbers

## Insights JSON structure

`insights_json` stored in the `insights` table (generated by `src/lib/insights.ts`):

```ts
{
  primary_product_category: string
  icp_audience: string
  messaging_pillars: string[]
  content_themes: string[]
  competitive_notes: {
    emphasis: string[]
    proof_points: string[]
    positioning: string
    pricing_signals: string
  }
  top_evidence_links: Array<{ url: string; title: string; reason: string }>
}
```

## V2 readiness notes

The codebase is structured for easy Supabase Auth addition:
- `src/lib/supabase.ts` exports `createServerClient()` — swap for `createServerClient` from `@supabase/ssr`
- Database tables have no `user_id` FK yet — add in a V2 migration
- RLS policies are disabled — enable per-user in V2
- API routes have no auth check — add `getUser()` guard in V2
- `source_config.social` toggle exists but is OFF by default (no social connector in V1)

## Key conventions

- All DB access goes through `createServerClient()` from `src/lib/supabase.ts`
- API routes live in `src/app/api/` and follow REST conventions; `params` is a `Promise` (Next.js 15+ async API)
- Client components are marked `'use client'` — server components are default
- Tailwind component classes (`.btn`, `.btn-primary`, `.btn-secondary`, `.btn-danger`, `.input`, `.label`, `.card`, `.badge`) are defined in `globals.css`
- Brand colors defined in `tailwind.config.ts`: primary-50 through primary-700 (base: #4f6ef7)
- TypeScript strict mode is on — no implicit `any`
- `pdf-lib` is used for PDF generation (not `pdfkit`, which is also a dependency but unused in routes)
- `maxDuration = 300` is set on the scans POST route to support long-running scans on Netlify
- Path alias `@/*` maps to `./src/*` (configured in `tsconfig.json`)
