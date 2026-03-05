import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { PDFDocument, StandardFonts, rgb, PageSizes } from 'pdf-lib'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ scanId: string }> }
) {
  const { scanId } = await params
  const db = createServerClient()

  const { data: scan, error: scanError } = await db
    .from('scans')
    .select('*')
    .eq('id', scanId)
    .single()

  if (!scan) {
    return NextResponse.json({ error: 'Scan not found', detail: scanError?.message ?? null }, { status: 404 })
  }

  const { data: company } = await db
    .from('companies')
    .select('*')
    .eq('id', scan.company_id)
    .single()

  const { data: insight } = await db
    .from('insights')
    .select('*')
    .eq('scan_id', scanId)
    .single()

  const { data: items } = await db
    .from('content_items')
    .select('url_canonical, title, source, content_type, platform, classification_confidence')
    .eq('scan_id', scanId)
    .order('content_type')
    .limit(200)

  // --- Build PDF ---
  const pdfDoc = await PDFDocument.create()
  const fontReg = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const [pageW, pageH] = PageSizes.A4
  const margin = 50
  const contentW = pageW - margin * 2

  const colors = {
    primary: rgb(0.31, 0.43, 0.97),
    dark: rgb(0.07, 0.09, 0.15),
    gray: rgb(0.42, 0.45, 0.50),
    white: rgb(1, 1, 1),
    lightBg: rgb(0.97, 0.98, 0.99),
    rule: rgb(0.85, 0.87, 0.92),
  }

  let page = pdfDoc.addPage([pageW, pageH])
  let y = pageH - margin

  function ensureSpace(needed: number) {
    if (y - needed < margin) {
      page = pdfDoc.addPage([pageW, pageH])
      y = pageH - margin
    }
  }

  function drawText(
    text: string,
    opts: {
      size?: number
      font?: typeof fontReg
      color?: ReturnType<typeof rgb>
      indent?: number
      maxWidth?: number
      lineHeight?: number
    } = {}
  ): number {
    const {
      size = 10,
      font = fontReg,
      color = colors.dark,
      indent = 0,
      maxWidth = contentW - indent,
      lineHeight = size * 1.45,
    } = opts

    const words = text.replace(/[^\x00-\xFF]/g, '?').replace(/\r?\n/g, ' ').split(' ').filter(Boolean)
    const lines: string[] = []
    let current = ''

    for (const word of words) {
      const test = current ? `${current} ${word}` : word
      if (font.widthOfTextAtSize(test, size) > maxWidth) {
        if (current) lines.push(current)
        current = word
      } else {
        current = test
      }
    }
    if (current) lines.push(current)

    let totalHeight = 0
    for (const line of lines) {
      ensureSpace(lineHeight)
      page.drawText(line, { x: margin + indent, y, size, font, color })
      y -= lineHeight
      totalHeight += lineHeight
    }
    return totalHeight
  }

  function drawRule(color = colors.rule, thickness = 0.5) {
    ensureSpace(4)
    page.drawLine({
      start: { x: margin, y },
      end: { x: pageW - margin, y },
      thickness,
      color,
    })
    y -= 6
  }

  function sectionHeader(title: string) {
    ensureSpace(30)
    y -= 8
    drawText(title, { size: 13, font: fontBold, color: colors.primary })
    drawRule(colors.primary, 0.75)
  }

  function subsection(title: string) {
    ensureSpace(20)
    y -= 4
    drawText(title, { size: 10, font: fontBold, color: colors.dark })
    y -= 2
  }

  function bullet(text: string) {
    drawText(`• ${text}`, { indent: 10, size: 10 })
    y -= 1
  }

  // ---- Cover ----
  page.drawRectangle({ x: 0, y: pageH - 180, width: pageW, height: 180, color: colors.primary })
  page.drawText(company?.name ?? 'Company', {
    x: margin, y: pageH - 70, size: 28, font: fontBold, color: colors.white,
  })
  page.drawText('Content Intelligence Report', {
    x: margin, y: pageH - 105, size: 14, font: fontReg, color: colors.white,
  })
  page.drawText(
    `Generated ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`,
    { x: margin, y: pageH - 128, size: 10, font: fontReg, color: rgb(0.78, 0.83, 0.99) }
  )
  y = pageH - 200

  // ---- Stats ----
  if (scan.stats) {
    const stats = scan.stats as Record<string, unknown>
    y -= 8
    drawText(
      `${stats.total_items ?? 0} items collected  ·  ${stats.iterations ?? 0} iterations  ·  ${Math.round(((stats.duration_ms as number) ?? 0) / 1000)}s`,
      { size: 9, color: colors.gray, font: fontReg }
    )
    y -= 10
    drawRule()
  }

  // ---- Insights ----
  if (insight) {
    const ij = insight.insights_json as Record<string, unknown>

    sectionHeader('Executive Summary')

    if (ij.primary_product_category) {
      subsection('Primary Product / Category')
      drawText(String(ij.primary_product_category))
      y -= 6
    }

    if (ij.icp_audience) {
      subsection('ICP / Target Audience')
      drawText(String(ij.icp_audience))
      y -= 6
    }

    if (Array.isArray(ij.messaging_pillars) && ij.messaging_pillars.length > 0) {
      subsection('Messaging Pillars')
      for (const p of ij.messaging_pillars as string[]) bullet(p)
      y -= 6
    }

    if (ij.competitive_notes && typeof ij.competitive_notes === 'object') {
      const cn = ij.competitive_notes as Record<string, unknown>
      sectionHeader('Competitive Notes')

      if (Array.isArray(cn.emphasis) && cn.emphasis.length > 0) {
        subsection('What they emphasize')
        for (const e of cn.emphasis as string[]) bullet(e)
        y -= 4
      }

      if (Array.isArray(cn.proof_points) && cn.proof_points.length > 0) {
        subsection('Proof points')
        for (const p of cn.proof_points as string[]) bullet(p)
        y -= 4
      }

      if (cn.positioning) {
        subsection('Positioning')
        drawText(String(cn.positioning))
        y -= 4
      }

      if (cn.pricing_signals) {
        subsection('Pricing signals')
        drawText(String(cn.pricing_signals))
        y -= 4
      }
    }

    if (Array.isArray(ij.top_evidence_links) && ij.top_evidence_links.length > 0) {
      sectionHeader('Top Evidence Links')
      for (const link of ij.top_evidence_links as Array<{ url: string; title: string; reason: string }>) {
        drawText(link.title ?? link.url, { font: fontBold, size: 9, color: colors.primary })
        if (link.reason) drawText(link.reason, { size: 9, color: colors.gray, indent: 10 })
        drawText(link.url, { size: 8, color: colors.gray, indent: 10 })
        y -= 4
      }
    }
  }

  // ---- Content breakdown ----
  if (items && items.length > 0) {
    sectionHeader(`Content Items (${items.length})`)

    const byType: Record<string, number> = {}
    for (const item of items) {
      byType[item.content_type] = (byType[item.content_type] ?? 0) + 1
    }

    subsection('Breakdown by type')
    for (const [type, count] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
      drawText(`${type}: ${count}`, { size: 9, indent: 10 })
    }
    y -= 8

    subsection('Top links')
    for (const item of items.slice(0, 50)) {
      const title = item.title ?? item.url_canonical
      const label = title.length > 90 ? title.slice(0, 87) + '…' : title
      drawText(label, { font: fontBold, size: 9, color: colors.primary })
      drawText(`${item.content_type} · ${item.platform ?? item.source}`, { size: 8, color: colors.gray, indent: 10 })
      y -= 2
    }
  }

  // ---- Page numbers ----
  const totalPages = pdfDoc.getPageCount()
  for (let i = 0; i < totalPages; i++) {
    const p = pdfDoc.getPage(i)
    p.drawText(`${i + 1} / ${totalPages}`, {
      x: pageW - margin - 30, y: 20, size: 8, font: fontReg, color: colors.gray,
    })
  }

  const pdfBytes = await pdfDoc.save()
  const companyName = (company?.name ?? 'company').replace(/[^a-z0-9]/gi, '_').toLowerCase()
  const filename = `${companyName}_report_${new Date().toISOString().split('T')[0]}.pdf`

  return new Response(Buffer.from(pdfBytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
