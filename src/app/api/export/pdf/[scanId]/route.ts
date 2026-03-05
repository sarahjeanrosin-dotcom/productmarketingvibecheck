import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import PDFDocument from 'pdfkit'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ scanId: string }> }
) {
  const { scanId } = await params
  const db = createServerClient()

  // Load scan + company
  const { data: scan, error: scanError } = await db
    .from('scans')
    .select('*')
    .eq('id', scanId)
    .single()

  if (!scan) {
    console.error('[PDF export] scan lookup failed', { scanId, scanError })
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

  // Generate PDF
  const chunks: Buffer[] = []

  try {
  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 60, size: 'A4' })

    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', resolve)
    doc.on('error', reject)

    const colors = {
      primary: '#4f6ef7',
      dark: '#111827',
      gray: '#6b7280',
      light: '#f9fafb',
    }

    // ---- Cover ----
    doc.rect(0, 0, doc.page.width, 200).fill(colors.primary)
    doc.fillColor('white')
      .fontSize(28)
      .font('Helvetica-Bold')
      .text(company?.name ?? 'Company', 60, 80)
    doc.fontSize(14)
      .font('Helvetica')
      .text('Content Intelligence Report', 60, 120)
    doc.fontSize(10)
      .text(`Generated ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, 60, 150)

    doc.fillColor(colors.dark)
    doc.moveDown(8)

    // ---- Stats summary ----
    if (scan.stats) {
      const stats = scan.stats as Record<string, unknown>
      doc.fontSize(10).font('Helvetica').fillColor(colors.gray)
      doc.text(
        `Total items: ${stats.total_items ?? 0}  |  Iterations: ${stats.iterations ?? 0}  |  Duration: ${Math.round(((stats.duration_ms as number) ?? 0) / 1000)}s`,
        { align: 'center' }
      )
      doc.moveDown(1.5)
    }

    // ---- Insights ----
    if (insight) {
      const ij = insight.insights_json as Record<string, unknown>

      sectionHeader(doc, 'Executive Summary', colors)

      if (ij.primary_product_category) {
        subsection(doc, 'Primary Product / Category', colors)
        doc.fontSize(10).font('Helvetica').fillColor(colors.dark)
        doc.text(String(ij.primary_product_category))
        doc.moveDown(0.75)
      }

      if (ij.icp_audience) {
        subsection(doc, 'ICP / Target Audience', colors)
        doc.fontSize(10).font('Helvetica').fillColor(colors.dark)
        doc.text(String(ij.icp_audience))
        doc.moveDown(0.75)
      }

      if (Array.isArray(ij.messaging_pillars) && ij.messaging_pillars.length > 0) {
        subsection(doc, 'Messaging Pillars', colors)
        for (const p of ij.messaging_pillars as string[]) {
          doc.fontSize(10).font('Helvetica').fillColor(colors.dark)
          doc.text(`• ${p}`, { indent: 12 })
        }
        doc.moveDown(0.75)
      }

      if (ij.competitive_notes && typeof ij.competitive_notes === 'object') {
        const cn = ij.competitive_notes as Record<string, unknown>
        sectionHeader(doc, 'Competitive Notes', colors)

        if (Array.isArray(cn.emphasis) && cn.emphasis.length > 0) {
          subsection(doc, 'What they emphasize', colors)
          for (const e of cn.emphasis as string[]) {
            doc.fontSize(10).font('Helvetica').fillColor(colors.dark).text(`• ${e}`, { indent: 12 })
          }
          doc.moveDown(0.5)
        }

        if (Array.isArray(cn.proof_points) && cn.proof_points.length > 0) {
          subsection(doc, 'Proof points', colors)
          for (const p of cn.proof_points as string[]) {
            doc.fontSize(10).font('Helvetica').fillColor(colors.dark).text(`• ${p}`, { indent: 12 })
          }
          doc.moveDown(0.5)
        }

        if (cn.positioning) {
          subsection(doc, 'Positioning', colors)
          doc.fontSize(10).font('Helvetica').fillColor(colors.dark).text(String(cn.positioning))
          doc.moveDown(0.5)
        }

        if (cn.pricing_signals) {
          subsection(doc, 'Pricing signals', colors)
          doc.fontSize(10).font('Helvetica').fillColor(colors.dark).text(String(cn.pricing_signals))
          doc.moveDown(0.5)
        }
      }

      if (Array.isArray(ij.top_evidence_links) && ij.top_evidence_links.length > 0) {
        sectionHeader(doc, 'Top Evidence Links', colors)
        for (const link of ij.top_evidence_links as Array<{ url: string; title: string; reason: string }>) {
          doc.fontSize(10).font('Helvetica-Bold').fillColor(colors.primary).text(link.title ?? link.url, { link: link.url })
          doc.font('Helvetica').fillColor(colors.gray).fontSize(9).text(link.reason ?? '')
          doc.moveDown(0.5)
        }
      }
    }

    // ---- Content breakdown ----
    if (items && items.length > 0) {
      doc.addPage()
      sectionHeader(doc, `Content Items (${items.length})`, colors)

      // By type summary
      const byType: Record<string, number> = {}
      for (const item of items) {
        byType[item.content_type] = (byType[item.content_type] ?? 0) + 1
      }

      doc.fontSize(10).font('Helvetica').fillColor(colors.dark)
      for (const [type, count] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
        doc.text(`${type}: ${count}`, { continued: false })
      }
      doc.moveDown(1)

      // Top 50 items
      subsection(doc, 'Top Links', colors)
      for (const item of items.slice(0, 50)) {
        const title = item.title ?? item.url_canonical
        doc.fontSize(9).font('Helvetica-Bold').fillColor(colors.primary)
          .text(title.slice(0, 80) + (title.length > 80 ? '…' : ''), { link: item.url_canonical })
        doc.font('Helvetica').fillColor(colors.gray)
          .text(`${item.content_type} · ${item.platform ?? item.source}`)
        doc.moveDown(0.3)
      }
    }

    doc.end()
  })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[PDF export] generation error:', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  const pdf = Buffer.concat(chunks)
  const companyName = (company?.name ?? 'company').replace(/[^a-z0-9]/gi, '_').toLowerCase()
  const filename = `${companyName}_report_${new Date().toISOString().split('T')[0]}.pdf`

  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}

function sectionHeader(doc: PDFKit.PDFDocument, text: string, colors: Record<string, string>) {
  doc.moveDown(0.5)
  doc.fontSize(14).font('Helvetica-Bold').fillColor(colors.primary).text(text)
  doc.moveTo(doc.page.margins.left, doc.y)
    .lineTo(doc.page.width - doc.page.margins.right, doc.y)
    .strokeColor(colors.primary)
    .lineWidth(0.5)
    .stroke()
  doc.moveDown(0.5)
}

function subsection(doc: PDFKit.PDFDocument, text: string, colors: Record<string, string>) {
  doc.fontSize(11).font('Helvetica-Bold').fillColor(colors.dark).text(text)
  doc.moveDown(0.3)
}
