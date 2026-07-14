// Generates a Feature Map of the app by reading its real source of truth —
// the web navigation registry, i18n labels, and action components — so the AI
// support assistant is grounded on what the app ACTUALLY does, with no manual
// authoring. Re-run whenever features change:  npm run generate:feature-map
//
// Output: apps/api/src/services/feature-map.generated.json (committed, bundled
// with the API so it is available at runtime without the web source).

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..', '..', '..')
const webSrc = path.join(repoRoot, 'apps', 'web', 'src')
const navFile = path.join(webSrc, 'components', 'layout', 'navigation.ts')
const i18nFile = path.join(webSrc, 'lib', 'i18n.ts')
const appDir = path.join(webSrc, 'app')
const outFile = path.join(repoRoot, 'apps', 'api', 'src', 'services', 'feature-map.generated.json')

const read = (file) => fs.readFileSync(file, 'utf8')

// --- 1) English labels from the i18n `en` dictionary -------------------------
function extractEnLabels() {
  const text = read(i18nFile)
  const start = text.indexOf('const en: Dict = {')
  if (start === -1) return {}
  // Walk to the matching closing brace of the object literal.
  let depth = 0
  let i = text.indexOf('{', start)
  const objStart = i
  for (; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}') {
      depth--
      if (depth === 0) break
    }
  }
  const block = text.slice(objStart, i + 1)
  const labels = {}
  const re = /'([^']+)':\s*'((?:[^'\\]|\\.)*)'/g
  let m
  while ((m = re.exec(block)) !== null) {
    labels[m[1]] = m[2].replace(/\\'/g, "'")
  }
  return labels
}

// --- 2) Nav items (feature inventory) from navigation.ts ---------------------
function extractNavItems() {
  const text = read(navFile)
  // Anchor directly on the array's opening bracket. Note `NavItem[]` also
  // contains brackets, so we point at the final '[' of the declaration.
  const marker = 'navItems: NavItem[] = ['
  const arrStart = text.indexOf(marker) + marker.length - 1
  let depth = 0
  let i = arrStart
  for (; i < text.length; i++) {
    if (text[i] === '[') depth++
    else if (text[i] === ']') {
      depth--
      if (depth === 0) break
    }
  }
  const block = text.slice(arrStart, i + 1)
  const items = []
  const objRe = /\{([^}]*)\}/g
  let m
  while ((m = objRe.exec(block)) !== null) {
    const body = m[1]
    const field = (name) => {
      const fm = body.match(new RegExp(`${name}:\\s*'([^']+)'`))
      return fm ? fm[1] : undefined
    }
    const href = field('href')
    if (!href) continue
    items.push({
      labelKey: field('label'),
      href,
      group: field('group'),
      permissionId: field('permissionId'),
      moduleKey: field('moduleKey'),
      featureKey: field('featureKey'),
    })
  }
  return items
}

// --- 3) Detect action components across pages --------------------------------
function collectPageFiles(dir) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...collectPageFiles(full))
    else if (entry.isFile() && /\.tsx?$/.test(entry.name)) out.push(full)
  }
  return out
}

function detectActions() {
  const files = collectPageFiles(appDir)
  const csvPages = new Set()
  const pdfRoutes = new Set()
  for (const file of files) {
    const text = read(file)
    const csvRe = /ExportCsvButton[\s\S]{0,160}?page=\{?["']([^"']+)["']/g
    let m
    while ((m = csvRe.exec(text)) !== null) csvPages.add(m[1])
    if (/Download PDF|handleDownloadChallan/.test(text)) {
      // order detail lives under app/orders/[id]; attribute to /orders
      const rel = path.relative(appDir, file).replace(/\\/g, '/')
      const route = '/' + rel.split('/')[0]
      pdfRoutes.add(route)
    }
  }
  return { csvPages, pdfRoutes }
}

// --- 4) Curated one-line descriptions (the "what/why" code can't express) ----
// Keyed by route. Missing routes still appear in the map with name + actions,
// so a newly added feature is never silently dropped.
const DESCRIPTIONS = {
  '/dashboard': 'Business pulse — key numbers, recent activity, and quick actions.',
  '/orders': 'Create and track customer orders/bills. Add items, quantities, prices, and the customer.',
  '/customers': 'Customer list and profiles with their outstanding balances and history.',
  '/partners': 'Referral partners who refer customers; track their referrals.',
  '/inventory': 'Your materials/products with stock levels and buying/selling prices.',
  '/imported-bills': 'Upload a supplier purchase-bill photo; the scanner extracts items to add as stock.',
  '/delivery': 'Delivery/transport board for dispatching and tracking orders.',
  '/khata': 'Customer ledger (udhaar). Record credit given and payments received; running balance per customer.',
  '/suppliers': 'Your suppliers and payables (amounts you owe them).',
  '/expenses': 'Record shop expenses and cash movements.',
  '/books': 'Double-entry accounting view.',
  '/financials': 'Profit/loss and financial summary.',
  '/gst': 'GST invoices and tax reports.',
  '/reports': 'Business reports and analytics across sales, dues, and stock.',
  '/tickets': 'Raise a query to the support team and track replies. Also has the AI assistant.',
  '/settings': 'Business profile, staff and permissions, and subscription.',
}

function gateNote(item) {
  const parts = []
  if (item.featureKey) parts.push(`requires the "${item.featureKey}" feature to be enabled`)
  if (item.group === 'insights' || (item.group === 'workspace' && item.href !== '/tickets')) {
    // Mirrors nav gating: insights + workspace (except tickets) are owner-only.
    if (item.href === '/settings' || item.group === 'insights') parts.push('owner only')
  }
  return parts.join('; ') || null
}

function build() {
  const labels = extractEnLabels()
  const navItems = extractNavItems()
  const { csvPages, pdfRoutes } = detectActions()

  const features = navItems.map((item) => {
    const name = (item.labelKey && labels[item.labelKey]) || item.href.replace('/', '')
    const groupName = (item.group && labels[`group.${item.group}`]) || item.group || null
    const actions = []
    const pageKey = item.href.replace('/', '')
    if (csvPages.has(pageKey)) actions.push('Export CSV (download this list as a CSV/Excel report; may require a paid plan)')
    if (pdfRoutes.has(item.href)) actions.push('Download PDF (open an order to download its challan/invoice PDF)')
    return {
      name,
      route: item.href,
      group: groupName,
      description: DESCRIPTIONS[item.href] ?? null,
      requires: gateNote(item),
      actions,
    }
  })

  const payload = {
    generatedFrom: ['navigation.ts', 'i18n.ts', 'ExportCsvButton usage', 'order PDF download'],
    note: 'Auto-generated by scripts/generate-feature-map.mjs. Do not edit by hand — re-run the generator.',
    features,
  }
  fs.mkdirSync(path.dirname(outFile), { recursive: true })
  fs.writeFileSync(outFile, JSON.stringify(payload, null, 2) + '\n', 'utf8')
  console.log(`Feature map written: ${path.relative(repoRoot, outFile)}`)
  console.log(`  ${features.length} features, ${csvPages.size} with CSV export, ${pdfRoutes.size} with PDF download`)
}

build()
