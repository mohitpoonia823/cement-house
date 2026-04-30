/**
 * PDF generation service using pdfkit.
 * Produces: delivery challan, party statement.
 * Called by GET /api/orders/:id/challan and GET /api/ledger/:customerId/statement
 */
import PDFDocument from 'pdfkit'
import type { FastifyReply } from 'fastify'

function applyManualDownloadHeaders(reply: FastifyReply) {
  reply.raw.setHeader('Access-Control-Allow-Origin', process.env.WEB_URL ?? 'http://localhost:3000')
  reply.raw.setHeader('Access-Control-Expose-Headers', 'Content-Disposition')
}

interface ChallanData {
  challanNumber:  string
  orderNumber:    string
  date:           Date
  customerName:   string
  customerPhone:  string
  customerAddress?: string
  driverName?:    string
  vehicleNumber?: string
  businessName:   string
  businessCity:   string
  totalAmount: number
  amountPaid: number
  paymentMode: string
  items: Array<{
    materialName: string
    unit:         string
    orderedQty:   number
    deliveredQty: number
  }>
}

interface StatementData {
  customerName:    string
  customerPhone:   string
  generatedAt:     Date
  currentBalance:  number
  businessName:    string
  businessCity:    string
  entries: Array<{
    date:    Date
    description: string
    debit:   number | null
    credit:  number | null
    balance: number
  }>
}

interface AnalyticsSnapshotData {
  title: string
  subtitle: string
  generatedAt: Date
  businessName: string
  businessCity: string
  metrics: Array<{
    label: string
    value: string
  }>
  sections: Array<{
    title: string
    rows: Array<{
      label: string
      value: string
    }>
  }>
}

function rupees(n: number) {
  return `Rs. ${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n)}`
}

/** Stream a PDF delivery challan into the Fastify reply */
export function streamChallan(data: ChallanData, reply: FastifyReply) {
  reply.hijack()
  const doc = new PDFDocument({ size: 'A5', margin: 40 })
  const pageWidth = doc.page.width
  const left = doc.page.margins.left
  const right = pageWidth - doc.page.margins.right
  const contentWidth = right - left
  applyManualDownloadHeaders(reply)
  reply.raw.setHeader('Content-Type', 'application/pdf')
  reply.raw.setHeader('Content-Disposition', `inline; filename="${data.challanNumber}.pdf"`)
  reply.raw.on('error', () => { /* Handle client disconnect silently */ })
  doc.pipe(reply.raw)

  // ── Header ──
  doc.fontSize(16).font('Helvetica-Bold').text(data.businessName, { align: 'center' })
  doc.fontSize(9).font('Helvetica').fillColor('#666')
    .text(`${data.businessCity}  |  Business Hub`, { align: 'center' })
  doc.moveDown(0.5)

  doc.moveTo(left, doc.y).lineTo(right, doc.y).strokeColor('#ccc').stroke()
  doc.moveDown(0.5)

  // ── Challan title + meta ──
  doc.fontSize(12).font('Helvetica-Bold').fillColor('#111').text('DELIVERY CHALLAN')
  doc.fontSize(9).font('Helvetica').fillColor('#444')
  doc.text(`Challan No: ${data.challanNumber}`, { continued: true })
  doc.text(`   Order: ${data.orderNumber}`, { continued: true })
  doc.text(`   Date: ${data.date.toLocaleDateString('en-IN')}`)
  doc.moveDown(0.5)

  // ── Deliver to ──
  doc.fontSize(9).font('Helvetica-Bold').fillColor('#111').text('Deliver to:')
  doc.font('Helvetica').fillColor('#333')
    .text(data.customerName)
    .text(data.customerPhone)
  if (data.customerAddress) doc.text(data.customerAddress)
  doc.moveDown(0.3)

  if (data.driverName || data.vehicleNumber) {
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#111').text('Driver / vehicle:')
    doc.font('Helvetica').fillColor('#333')
      .text([data.driverName, data.vehicleNumber].filter(Boolean).join('  ·  '))
    doc.moveDown(0.3)
  }

  doc.moveDown(0.3)
  doc.moveTo(left, doc.y).lineTo(right, doc.y).strokeColor('#ddd').stroke()
  doc.moveDown(0.4)

  // ── Items table ──
  const cols = {
    material: left,
    ordered: left + contentWidth * 0.61,
    delivered: left + contentWidth * 0.76,
    unit: left + contentWidth * 0.9,
  }
  doc.fontSize(9).font('Helvetica-Bold').fillColor('#666')
  doc.text('Item',       cols.material,  doc.y, { width: contentWidth * 0.58 })
  doc.text('Ordered',    cols.ordered,   doc.y - 11, { width: contentWidth * 0.14, align: 'right' })
  doc.text('Delivered',  cols.delivered, doc.y - 11, { width: contentWidth * 0.13, align: 'right' })
  doc.text('Unit',       cols.unit,      doc.y - 11, { width: contentWidth * 0.08, align: 'right' })
  doc.moveDown(0.4)
  doc.moveTo(left, doc.y).lineTo(right, doc.y).strokeColor('#eee').stroke()
  doc.moveDown(0.3)

  doc.font('Helvetica').fillColor('#111')
  for (const item of data.items) {
    const mismatch = item.orderedQty !== item.deliveredQty
    const rowY = doc.y
    doc.text(item.materialName, cols.material, rowY, { width: contentWidth * 0.58 })
    doc.text(String(item.orderedQty), cols.ordered, rowY, { width: contentWidth * 0.14, align: 'right' })
    doc.fillColor(mismatch ? '#c00' : '#111')
      .text(String(item.deliveredQty), cols.delivered, rowY, { width: contentWidth * 0.13, align: 'right' })
    doc.fillColor('#666')
      .text(item.unit, cols.unit, rowY, { width: contentWidth * 0.08, align: 'right' })
    doc.fillColor('#111')
    doc.moveDown(0.5)
  }

  doc.moveDown(0.5)
  doc.moveTo(left, doc.y).lineTo(right, doc.y).strokeColor('#ccc').stroke()
  doc.moveDown(0.8)

  const outstanding = Math.max(0, Number(data.totalAmount) - Number(data.amountPaid))
  doc.fontSize(8).font('Helvetica-Bold').fillColor('#666').text('PAYMENT', left, doc.y)
  doc.moveDown(0.25)
  doc.fontSize(9).font('Helvetica')
  const valueX = left + contentWidth * 0.62
  const valueW = contentWidth * 0.38
  const writePaymentRow = (label: string, value: string, color: string) => {
    const rowY = doc.y
    doc.fillColor('#555').text(label, left, rowY, { width: contentWidth * 0.6 })
    doc.fillColor(color).text(value, valueX, rowY, { width: valueW, align: 'right' })
    doc.moveDown(0.05)
  }
  writePaymentRow('Order total', rupees(Number(data.totalAmount)), '#111')
  writePaymentRow('Paid', rupees(Number(data.amountPaid)), '#0a7d2e')
  writePaymentRow('Outstanding', outstanding > 0 ? rupees(outstanding) : 'Cleared', outstanding > 0 ? '#c00' : '#0a7d2e')
  writePaymentRow('Mode', data.paymentMode, '#111')

  doc.moveDown(0.6)
  doc.moveTo(left, doc.y).lineTo(right, doc.y).strokeColor('#ccc').stroke()
  doc.moveDown(1.0)

  // ── Signature boxes ──
  const sigY = doc.y
  doc.fontSize(9).fillColor('#555')
  const sigCol2 = left + contentWidth * 0.58
  doc.text('Driver signature:', left, sigY)
  doc.text('Receiver signature:', sigCol2, sigY)
  doc.moveTo(left, sigY + 40).lineTo(left + contentWidth * 0.42, sigY + 40).strokeColor('#aaa').stroke()
  doc.moveTo(sigCol2, sigY + 40).lineTo(right, sigY + 40).strokeColor('#aaa').stroke()
  doc.fontSize(7).fillColor('#999')
  doc.text('Name + sign', left, sigY + 44)
  doc.text('Name + sign', sigCol2, sigY + 44)

  doc.end()
}

/** Stream a PDF ledger statement into the Fastify reply */
export function streamStatement(data: StatementData, reply: FastifyReply) {
  reply.hijack()
  const doc = new PDFDocument({ size: 'A4', margin: 50 })
  applyManualDownloadHeaders(reply)
  reply.raw.setHeader('Content-Type', 'application/pdf')
  reply.raw.setHeader('Content-Disposition', `inline; filename="statement-${data.customerName.replace(/\s+/g, '-')}.pdf"`)
  reply.raw.on('error', () => { /* Handle client disconnect silently */ })
  doc.pipe(reply.raw)

  // Header
  doc.fontSize(18).font('Helvetica-Bold').text(data.businessName)
  doc.fontSize(10).font('Helvetica').fillColor('#666')
    .text(`${data.businessCity}  |  Business Hub`)
  doc.moveDown(0.5)
  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#ccc').stroke()
  doc.moveDown(0.5)

  doc.fontSize(13).font('Helvetica-Bold').fillColor('#111').text('Account Statement')
  doc.fontSize(10).font('Helvetica').fillColor('#444')
  doc.text(`Party: ${data.customerName}  ·  ${data.customerPhone}`)
  doc.text(`Generated: ${data.generatedAt.toLocaleDateString('en-IN')}`)
  doc.moveDown(0.5)

  // Table header
  const c = { date: 50, desc: 120, debit: 340, credit: 420, balance: 490 }
  doc.fontSize(9).font('Helvetica-Bold').fillColor('#666')
  doc.text('Date',    c.date,    doc.y, { width: 65 })
  doc.text('Description', c.desc, doc.y - 11, { width: 210 })
  doc.text('Debit',   c.debit,   doc.y - 11, { width: 70, align: 'right' })
  doc.text('Credit',  c.credit,  doc.y - 11, { width: 60, align: 'right' })
  doc.text('Balance', c.balance, doc.y - 11, { width: 60, align: 'right' })
  doc.moveDown(0.3)
  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#ddd').stroke()
  doc.moveDown(0.3)

  doc.fontSize(9).font('Helvetica')
  for (const e of data.entries) {
    const rowY = doc.y
    doc.fillColor('#555').text(new Date(e.date).toLocaleDateString('en-IN'), c.date, rowY, { width: 65 })
    doc.fillColor('#111').text(e.description, c.desc, rowY, { width: 210 })
    doc.fillColor(e.debit  ? '#c00' : '#bbb').text(e.debit  ? rupees(e.debit)  : '—', c.debit,  rowY, { width: 70,  align: 'right' })
    doc.fillColor(e.credit ? '#080' : '#bbb').text(e.credit ? rupees(e.credit) : '—', c.credit, rowY, { width: 60,  align: 'right' })
    doc.fillColor(e.balance > 0 ? '#c00' : '#080')
      .text(e.balance > 0 ? `-${rupees(e.balance)}` : rupees(0), c.balance, rowY, { width: 60, align: 'right' })
    doc.fillColor('#111').moveDown(0.5)
  }

  doc.moveDown(0.5)
  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#ccc').stroke()
  doc.moveDown(0.5)

  // Balance summary
  doc.fontSize(11).font('Helvetica-Bold')
  const balColor = data.currentBalance > 0 ? '#c00' : '#080'
  doc.fillColor('#111').text('Current outstanding balance:', { continued: true })
  doc.fillColor(balColor).text(`  ${rupees(data.currentBalance)}`)

  doc.end()
}

export function streamAnalyticsSnapshot(data: AnalyticsSnapshotData, reply: FastifyReply) {
  reply.hijack()
  const doc = new PDFDocument({ size: 'A4', margin: 50 })
  const safeTitle = data.title.toLowerCase().replace(/\s+/g, '-')
  applyManualDownloadHeaders(reply)
  reply.raw.setHeader('Content-Type', 'application/pdf')
  reply.raw.setHeader('Content-Disposition', `attachment; filename="${safeTitle}-snapshot.pdf"`)
  reply.raw.on('error', () => { /* Handle client disconnect silently */ })
  doc.pipe(reply.raw)

  doc.fontSize(18).font('Helvetica-Bold').fillColor('#111').text(data.businessName)
  doc.fontSize(10).font('Helvetica').fillColor('#666').text(`${data.businessCity} | Analytics snapshot`)
  doc.moveDown(0.4)
  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#d4d4d8').stroke()
  doc.moveDown(0.7)

  doc.fontSize(20).font('Helvetica-Bold').fillColor('#111').text(data.title)
  doc.fontSize(10).font('Helvetica').fillColor('#52525b').text(data.subtitle)
  doc.text(`Generated on ${data.generatedAt.toLocaleDateString('en-IN')} at ${data.generatedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`)
  doc.moveDown(0.8)

  doc.fontSize(11).font('Helvetica-Bold').fillColor('#111').text('Key metrics')
  doc.moveDown(0.4)

  const metricWidth = 230
  data.metrics.forEach((metric, index) => {
    const x = 50 + (index % 2) * 250
    const y = doc.y + Math.floor(index / 2) * 58
    doc.roundedRect(x, y, metricWidth, 46, 10).fillAndStroke('#f8fafc', '#e2e8f0')
    doc.fillColor('#64748b').fontSize(9).font('Helvetica-Bold').text(metric.label, x + 12, y + 10, { width: metricWidth - 24 })
    doc.fillColor('#0f172a').fontSize(14).font('Helvetica-Bold').text(metric.value, x + 12, y + 24, { width: metricWidth - 24 })
  })

  doc.y += Math.ceil(data.metrics.length / 2) * 58 + 12

  for (const section of data.sections) {
    if (doc.y > 700) doc.addPage()
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#111').text(section.title)
    doc.moveDown(0.35)
    section.rows.forEach((row) => {
      const rowY = doc.y
      doc.fontSize(10).font('Helvetica').fillColor('#52525b').text(row.label, 50, rowY, { width: 270 })
      doc.font('Helvetica-Bold').fillColor('#111').text(row.value, 330, rowY, { width: 215, align: 'right' })
      doc.moveDown(0.45)
    })
    doc.moveDown(0.6)
  }

  doc.end()
}
