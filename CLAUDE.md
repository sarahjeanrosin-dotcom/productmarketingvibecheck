# Content Intelligence Micro-App — CLAUDE.md

Internal tool for Product Marketing to collect, classify, and analyze public content about companies (competitors or targets).

## Stack

- **Framework**: Next.js 15 (App Router, TypeScript)
- **Database**: Supabase (PostgreSQL)
- **AI**: Anthropic (`claude-haiku-4-5-20251001` for classification, `claude-sonnet-4-6` for insights)
- **Search**: Serper.dev (web + Reddit), YouTube Data API v3
- **PDF**: pdfkit (server-side)
- **Styling**: Tailwind CSS
- **Deploy**: Netlify (`@netlify/plugin-nextjs`)

## Project structure

```
src/
  app/
    page.tsx                          # Redirects to /companies
    layout.tsx                        # Root layout with nav header
    globals.css                       # Tailwind + component classes
    companies/
      page.tsx                        # Company list
      new/page.tsx                    # Create company form
      [id]/page.tsx                   # Company detail: scan, results, insights
    api/
      companies/route.ts              # GET /api/companies, POST /api/companies
      companies/[id]/route.ts         # GET, PATCH, DELETE /api/companies/:id
      scans/route.ts                  # GET ?company_id=, POST (starts scan)
      export/csv/[scanId]/route.ts    # GET — download CSV of content items
      export/pdf/[scanId]/route.ts    # GET — download PDF report
  components/
    ScanStatusPanel.tsx               # Scan progress + stats display
    ResultsTable.tsx                  # Filterable/paginated content item table
    InsightsPanel.tsx                 # Collapsible strategic insights display
  lib/
    types.ts                          # All TypeScript types + default exclusions
    supabase.ts                       # Supabase client (V1: single anon client)
    serper.ts                         # Serper.dev API wrapper (web + reddit + reviews)
    youtube.ts                        # YouTube Data API v3 wrapper
    classifier.ts                     # LLM + heuristic URL classification
    insights.ts                       # Anthropic insights generation
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
- `companies` — company config and source toggles
- `scans` — scan runs with status and stats
- `content_items` — classified URLs discovered per scan
- `insights` — AI-generated strategic insights per scan

RLS is disabled in V1. Enable it in V2 when adding Supabase Auth.

## Scan lifecycle

1. **POST /api/scans** with `{ company_id }`:
   - Deletes prior scans/items/insights for that company (replace-on-rerun)
   - Creates scan with status `queued`
   - Runs `runScan()` synchronously (maxDuration=300s for Netlify)
   - Returns completed scan

2. **`runScan()`** in `src/lib/scanner.ts`:
   - Iterative URL discovery (Serper web + Reddit + reviews + YouTube)
   - Stop conditions: no new URLs for 2 consecutive iterations, max_items (default 200), max_iterations (default 12)
   - Batch classification via Anthropic Haiku (20 items/batch), fallback to URL heuristics
   - Saves content_items to Supabase (upsert by `company_id + url_hash`)
   - Generates insights via Anthropic Sonnet
   - Updates scan to `completed`

3. **Client polls** `GET /api/scans?company_id=` every 3 seconds while status is running/queued

## Classification

URL heuristics in `src/lib/classifier.ts` detect:
- `content_type`: landing, product, blog, pdf, press, review, video, social, other
- `category`: sales_asset, product_marketing, pr, review, other
- `platform`: youtube, reddit, g2, capterra, trustpilot, etc.

LLM classification uses Haiku in batches of 20. Falls back to heuristics on any error.

## Exclusions

Default excluded URL patterns (defined in `src/lib/types.ts`):
- Careers/jobs, legal/privacy/terms, investor relations, support/help/docs

Users can add extra exclude keywords per company.

## Exports

- **CSV**: All content_items for the latest scan (title, URL, type, source, platform, metrics)
- **PDF**: Full report with insights + competitive notes + top links (generated server-side with pdfkit)

## V2 readiness notes

The codebase is structured for easy Supabase Auth addition:
- `src/lib/supabase.ts` exports `createServerClient()` — swap for `createServerClient` from `@supabase/ssr`
- Database tables have no `user_id` FK yet — add in a V2 migration
- RLS policies are disabled — enable per-user in V2
- API routes have no auth check — add `getUser()` guard in V2
- `source_config.social` toggle exists but is OFF by default (no social connector in V1)

## Key conventions

- All DB access goes through `createServerClient()` from `src/lib/supabase.ts`
- API routes are in `src/app/api/` and follow REST conventions
- Client components are marked `'use client'` — server components are default
- Tailwind component classes (`.btn`, `.input`, `.card`, `.badge`) are defined in `globals.css`
- TypeScript strict mode is on — no implicit `any`
- pdfkit is server-only (not importable in client components)
- `maxDuration = 300` on the scans POST route for long-running scan support
