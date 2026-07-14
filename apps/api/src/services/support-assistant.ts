// AI support assistant (v1: answer-only self-service Q&A).
// Reuses the same Gemini setup as the purchase bill scanner. The model is
// grounded on a knowledge base — the Super Admin's editable DB entries when
// present, otherwise the built-in fallback below — so it answers about THIS
// app's features specifically and does not invent product behaviour.
import { supportKbRepository } from '@cement-house/db'

export class SupportAssistantConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SupportAssistantConfigError'
  }
}

export type AssistantLanguage = 'en' | 'hi' | 'hinglish'

type AssistantTurn = { role: 'user' | 'assistant'; content: string }

// Built-in fallback knowledge base. Used only when the Super Admin has not
// published any KB entries in the database. Keep it focused and factual.
const FALLBACK_KNOWLEDGE_BASE = `
APP OVERVIEW
NexaHub is a business management app for Indian shopkeepers and distributors (e.g. cement / building-material stores). It runs on web and installs as a PWA (Install App button in the top bar). It supports English, Hindi, and Hinglish via the language selector.

NAVIGATION & MODULES
- Overview (Dashboard): business pulse — key numbers, recent activity.
- Orders: create and track customer orders/bills. Use "+ New order" (top bar) or Orders > New. Each order records items, quantities, prices, and the customer.
- Customers: customer list and profiles, their outstanding balances and history.
- Referral Partners: people who refer customers; track their referrals.
- Inventory: your materials/products, stock levels, and buying/selling prices.
- Imported Bills: upload a supplier's purchase bill image and the app auto-extracts items (AI bill scanner) so you can add stock quickly.
- Delivery: delivery/transport board for dispatching orders (available when transport management is enabled).
- Khata: customer ledger / udhaar. Record credit given and payments received; each customer's running balance is tracked here.
- Suppliers: your suppliers and payables (what you owe them).
- Cash & Expenses: record shop expenses and cash movements.
- Books: double-entry accounting view.
- Financials: profit/loss and financial summary.
- GST: GST billing and tax reports (available when GST billing is enabled).
- Reports: business reports and analytics across sales, dues, and stock.
- Tickets: raise a query to the support team and track replies.
- Settings: business profile, staff, and subscription.

COMMON TASKS
- Add a customer: Customers > New (or the New button on the Customers page). Enter name, phone, city.
- Record a new sale/order: use "+ New order" in the top bar, pick the customer, add items, save.
- Record a payment received (customer paid their udhaar): open the customer in Khata and add a payment entry; the balance updates automatically.
- Give credit / record udhaar: this is recorded automatically when an order is on credit, and shows in Khata.
- Add stock from a supplier bill: Imported Bills > upload the bill photo; review the auto-extracted items and confirm to add them to Inventory.
- Add staff members: Settings > staff section. You can set permissions per staff member.
- Change language: use the language dropdown in the top bar (English / Hindi / Hinglish).
- Install the app on phone/desktop: tap "Install App" in the top bar, or use the browser's Add to Home Screen / Install option.

SUBSCRIPTION & BILLING
- New businesses get a free trial. When it ends, the workspace locks until a paid plan is activated.
- Plans: BASIC, PRO, ENTERPRISE, billed MONTHLY or YEARLY. See Settings > Subscription.
- Payments are handled by Razorpay secure checkout (card, UPI, netbanking, wallet).
- After a successful payment the plan activates and the workspace unlocks automatically.
- Only the business OWNER can manage the subscription and staff.

ROLES
- OWNER: full access, manages subscription, staff, and settings.
- Staff (MUNIM): access limited to the permissions the owner grants.

TICKETS / HUMAN SUPPORT
- If the AI cannot resolve the issue, the user can still raise a ticket to the human support team using the "Need Help" form on the Tickets page. Replies appear in the same conversation thread.
`

// Loads the active knowledge base: the Super Admin's published DB entries when
// any exist, otherwise the built-in fallback. Never throws — a DB hiccup must
// not take the assistant down, so it degrades to the fallback text.
async function loadKnowledgeBase(): Promise<string> {
  try {
    const entries = await supportKbRepository.listPublishedKbEntries()
    if (entries.length > 0) {
      return entries
        .map((entry) => {
          const heading = entry.category ? `${entry.category} — ${entry.title}` : entry.title
          return `## ${heading}\n${entry.content}`
        })
        .join('\n\n')
    }
  } catch {
    // fall through to the built-in knowledge base
  }
  return FALLBACK_KNOWLEDGE_BASE
}

function languageInstruction(language: AssistantLanguage) {
  if (language === 'hi') return 'Reply in Hindi (Devanagari script). Keep it simple and friendly.'
  if (language === 'hinglish') return 'Reply in Hinglish (Roman-script Hindi mixed with English), the casual way Indian shopkeepers chat.'
  return 'Reply in clear, simple English.'
}

function extractGeminiText(response: any) {
  return response?.candidates?.[0]?.content?.parts?.find((part: any) => typeof part?.text === 'string')?.text ?? null
}

export async function answerSupportQuestion(input: {
  message: string
  language: AssistantLanguage
  history?: AssistantTurn[]
  businessName?: string | null
}) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new SupportAssistantConfigError('GEMINI_API_KEY is not configured for the support assistant')
  }

  const model = process.env.GEMINI_SUPPORT_MODEL ?? process.env.GEMINI_BILL_SCAN_MODEL ?? 'gemini-2.0-flash'

  const knowledgeBase = await loadKnowledgeBase()

  const systemPrompt = [
    'You are the in-app support assistant for NexaHub, a business management app for Indian shopkeepers.',
    'Answer the user\'s question using ONLY the knowledge base below. Be concise, warm, and practical — most users are non-technical shop owners.',
    'When explaining how to do something, give short step-by-step directions and name the exact screen/button (e.g. "Khata", "+ New order").',
    'If the knowledge base does not contain the answer, do NOT guess. Say you are not sure and suggest they raise a ticket using the "Need Help" form on the Tickets page for the human support team.',
    'Never ask for or reveal passwords, OTPs, or payment card details. For their actual data/numbers, point them to the relevant screen (e.g. Reports) rather than inventing figures.',
    languageInstruction(input.language),
    input.businessName ? `The user's business is "${input.businessName}".` : '',
    '',
    'KNOWLEDGE BASE:',
    knowledgeBase,
  ].filter(Boolean).join('\n')

  const history = (input.history ?? []).slice(-6)
  const contents = [
    { role: 'user', parts: [{ text: systemPrompt }] },
    { role: 'model', parts: [{ text: 'Understood. I will help using only that knowledge base.' }] },
    ...history.map((turn) => ({
      role: turn.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: turn.content }],
    })),
    { role: 'user', parts: [{ text: input.message }] },
  ]

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 600,
        },
      }),
      signal: AbortSignal.timeout(20_000),
    },
  )

  const body: any = await response.json().catch(() => null)
  if (!response.ok) {
    const message = body?.error?.message ?? 'Support assistant request failed'
    throw new Error(message)
  }

  const answer = extractGeminiText(body)?.trim()
  if (!answer) throw new Error('Support assistant returned an empty response')

  return { provider: 'gemini', model, answer }
}
