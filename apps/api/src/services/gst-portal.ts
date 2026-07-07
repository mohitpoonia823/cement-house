// Builds the GST-portal (offline tool / GSTN API) GSTR-1 JSON from the
// invoice-level rows produced by accountingRepository.getGstr1InvoiceLevel.
// Pure data transform — no I/O — so it can be unit-tested in isolation.

type InvoiceLevelData = {
  business: { name: string; gstin: string | null; stateCode: string | null }
  b2bRows: Array<{
    orderId: string
    invoiceNumber: string
    invoiceDate: Date | string
    invoiceValue: number
    customerGstin: string
    customerName: string
    rate: number
    taxable: number
    cgst: number
    sgst: number
    igst: number
  }>
  b2csRows: Array<{
    stateCode: string
    rate: number
    taxable: number
    cgst: number
    sgst: number
    igst: number
  }>
  hsnRows: Array<{
    hsnCode: string
    qty: number
    taxable: number
    cgst: number
    sgst: number
    igst: number
  }>
  creditNoteRows: Array<{
    returnId: string
    returnNumber: string
    returnDate: Date | string
    noteValue: number
    invoiceNumber: string
    invoiceDate: Date | string
    customerGstin: string | null
    customerStateCode: string | null
    rate: number
    taxable: number
    cgst: number
    sgst: number
    igst: number
  }>
}

export interface Gstr1PortalResult {
  fileName: string
  json: Record<string, unknown>
  summary: {
    b2bInvoices: number
    b2bTaxable: number
    b2csEntries: number
    b2csTaxable: number
    hsnLines: number
    cdnrNotes: number
    cdnurNotes: number
  }
  warnings: string[]
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

function portalDate(value: Date | string) {
  const d = new Date(value)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}-${mm}-${d.getFullYear()}`
}

function itemDetail(row: { rate: number; taxable: number; cgst: number; sgst: number; igst: number }) {
  return {
    rt: round2(row.rate),
    txval: round2(row.taxable),
    iamt: round2(row.igst),
    camt: round2(row.cgst),
    samt: round2(row.sgst),
    csamt: 0,
  }
}

function gstinStateCode(gstin: string) {
  const match = gstin.trim().match(/^(\d{2})/)
  return match ? match[1] : null
}

export function buildGstr1PortalJson(input: {
  data: InvoiceLevelData
  periodStart: Date
}): Gstr1PortalResult | { error: string } {
  const { business, b2bRows, b2csRows, hsnRows, creditNoteRows } = input.data
  const warnings: string[] = []

  if (!business.gstin) {
    return { error: 'Business GSTIN is not configured. Set it in Settings before exporting the portal JSON.' }
  }
  const businessState = business.stateCode ?? gstinStateCode(business.gstin)
  if (!business.stateCode) {
    warnings.push(
      businessState
        ? `Business state code missing — derived "${businessState}" from the business GSTIN.`
        : 'Business state code missing and not derivable from GSTIN — B2CS place of supply may be wrong.'
    )
  }

  const fp = `${String(input.periodStart.getMonth() + 1).padStart(2, '0')}${input.periodStart.getFullYear()}`

  // ── B2B: group invoice×rate rows by buyer GSTIN, then by invoice ──────────
  const byCtin = new Map<string, Map<string, { inv: any; itms: any[] }>>()
  for (const row of b2bRows) {
    const ctin = row.customerGstin.toUpperCase()
    const pos = gstinStateCode(ctin)
    if (!pos) {
      warnings.push(`Invoice ${row.invoiceNumber}: buyer GSTIN "${ctin}" is malformed (no state prefix) — invoice skipped from B2B.`)
      continue
    }
    if (!byCtin.has(ctin)) byCtin.set(ctin, new Map())
    const invoices = byCtin.get(ctin)!
    if (!invoices.has(row.orderId)) {
      invoices.set(row.orderId, {
        inv: {
          inum: row.invoiceNumber,
          idt: portalDate(row.invoiceDate),
          val: round2(row.invoiceValue),
          pos,
          rchrg: 'N',
          inv_typ: 'R',
        },
        itms: [],
      })
    }
    const entry = invoices.get(row.orderId)!
    entry.itms.push({ num: entry.itms.length + 1, itm_det: itemDetail(row) })
  }
  const b2b = Array.from(byCtin.entries()).map(([ctin, invoices]) => ({
    ctin,
    inv: Array.from(invoices.values()).map(({ inv, itms }) => ({ ...inv, itms })),
  }))

  // ── B2CS: rate-level aggregates by place of supply ────────────────────────
  // Rows with no customer state fall back to the business's own state (intra).
  let missingStateFallbacks = 0
  const b2csAgg = new Map<string, { pos: string; rate: number; taxable: number; cgst: number; sgst: number; igst: number }>()
  for (const row of b2csRows) {
    let pos = row.stateCode
    if (!pos) {
      pos = businessState ?? ''
      missingStateFallbacks += 1
    }
    if (!pos) continue
    const key = `${pos}:${row.rate}`
    const existing = b2csAgg.get(key)
    if (existing) {
      existing.taxable += row.taxable
      existing.cgst += row.cgst
      existing.sgst += row.sgst
      existing.igst += row.igst
    } else {
      b2csAgg.set(key, { pos, rate: row.rate, taxable: row.taxable, cgst: row.cgst, sgst: row.sgst, igst: row.igst })
    }
  }
  if (missingStateFallbacks > 0) {
    warnings.push(
      `${missingStateFallbacks} B2C state-rate bucket(s) had no customer state code — reported as intra-state (POS ${businessState ?? '??'}). Record customer state codes for accurate B2CS.`
    )
  }
  const b2cs = Array.from(b2csAgg.values()).map((row) => ({
    sply_ty: businessState && row.pos === businessState ? 'INTRA' : 'INTER',
    pos: row.pos,
    typ: 'OE',
    rt: round2(row.rate),
    txval: round2(row.taxable),
    iamt: round2(row.igst),
    camt: round2(row.cgst),
    samt: round2(row.sgst),
    csamt: 0,
  }))

  // ── HSN summary ────────────────────────────────────────────────────────────
  const unspecifiedHsn = hsnRows.filter((h) => !h.hsnCode)
  if (unspecifiedHsn.length > 0) {
    warnings.push(
      'Some order lines have no HSN code — they are exported with an empty hsn_sc and the portal will reject them. Configure HSN codes on those materials.'
    )
  }
  const hsn = {
    data: hsnRows.map((h, i) => ({
      num: i + 1,
      hsn_sc: h.hsnCode,
      uqc: 'OTH',
      qty: round2(h.qty),
      txval: round2(h.taxable),
      iamt: round2(h.igst),
      camt: round2(h.cgst),
      samt: round2(h.sgst),
      csamt: 0,
    })),
  }

  // ── Credit notes: CDNR (registered buyers) / CDNUR (unregistered) ─────────
  const cdnrByCtin = new Map<string, Map<string, { nt: any; itms: any[] }>>()
  const cdnurNotes = new Map<string, { nt: any; itms: any[] }>()
  let intraStateUnregisteredNotes = 0
  for (const row of creditNoteRows) {
    if (row.customerGstin) {
      const ctin = row.customerGstin.toUpperCase()
      const pos = gstinStateCode(ctin)
      if (!pos) {
        warnings.push(`Credit note ${row.returnNumber}: buyer GSTIN "${ctin}" is malformed — note skipped from CDNR.`)
        continue
      }
      if (!cdnrByCtin.has(ctin)) cdnrByCtin.set(ctin, new Map())
      const notes = cdnrByCtin.get(ctin)!
      if (!notes.has(row.returnId)) {
        notes.set(row.returnId, {
          nt: {
            ntty: 'C',
            nt_num: row.returnNumber,
            nt_dt: portalDate(row.returnDate),
            pos,
            rchrg: 'N',
            inv_typ: 'R',
            val: round2(row.noteValue),
          },
          itms: [],
        })
      }
      const entry = notes.get(row.returnId)!
      entry.itms.push({ num: entry.itms.length + 1, itm_det: itemDetail(row) })
    } else if (row.igst > 0) {
      // CDNUR applies to inter-state notes against unregistered buyers (B2CL).
      const pos = row.customerStateCode ?? ''
      if (!cdnurNotes.has(row.returnId)) {
        cdnurNotes.set(row.returnId, {
          nt: {
            typ: 'B2CL',
            ntty: 'C',
            nt_num: row.returnNumber,
            nt_dt: portalDate(row.returnDate),
            pos: pos || businessState || '',
            val: round2(row.noteValue),
          },
          itms: [],
        })
      }
      const entry = cdnurNotes.get(row.returnId)!
      entry.itms.push({ num: entry.itms.length + 1, itm_det: itemDetail(row) })
    } else {
      intraStateUnregisteredNotes += 1
    }
  }
  if (intraStateUnregisteredNotes > 0) {
    warnings.push(
      `${intraStateUnregisteredNotes} intra-state credit-note line(s) against unregistered buyers are NOT included: the portal nets these off inside B2CS, so reduce B2CS values manually or file them via the portal's amendment flow.`
    )
  }
  const cdnr = Array.from(cdnrByCtin.entries()).map(([ctin, notes]) => ({
    ctin,
    nt: Array.from(notes.values()).map(({ nt, itms }) => ({ ...nt, itms })),
  }))
  const cdnur = Array.from(cdnurNotes.values()).map(({ nt, itms }) => ({ ...nt, itms }))

  const json: Record<string, unknown> = {
    gstin: business.gstin,
    fp,
    version: 'GST3.0.4',
    hash: 'hash',
    ...(b2b.length > 0 ? { b2b } : {}),
    ...(b2cs.length > 0 ? { b2cs } : {}),
    ...(cdnr.length > 0 ? { cdnr } : {}),
    ...(cdnur.length > 0 ? { cdnur } : {}),
    ...(hsn.data.length > 0 ? { hsn } : {}),
  }

  const b2bInvoiceCount = b2b.reduce((sum, entry) => sum + entry.inv.length, 0)
  return {
    fileName: `GSTR1_${business.gstin}_${fp}.json`,
    json,
    summary: {
      b2bInvoices: b2bInvoiceCount,
      b2bTaxable: round2(b2bRows.reduce((sum, r) => sum + r.taxable, 0)),
      b2csEntries: b2cs.length,
      b2csTaxable: round2(b2csRows.reduce((sum, r) => sum + r.taxable, 0)),
      hsnLines: hsn.data.length,
      cdnrNotes: cdnr.reduce((sum, entry) => sum + entry.nt.length, 0),
      cdnurNotes: cdnur.length,
    },
    warnings,
  }
}
