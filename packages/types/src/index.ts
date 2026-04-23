// ── Shared TypeScript types across web + api ─────────────────────────────────

export type ApiResponse<T> = {
  success: true
  data: T
} | {
  success: false
  error: string
  code?: string
}

export type PaginatedResponse<T> = {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

// Auth
export interface LoginPayload { phone: string; password: string }
export interface AuthToken    { token: string; user: { id: string; name: string; role: string } }

// Dashboard summary
export interface DashboardSummary {
  todaySales:        number
  cashCollected:     number
  totalOutstanding:  number
  overdueCount:      number
  lowStockCount:     number
  todayOrderCount:   number
}

// Customer balance (computed)
export interface CustomerBalance {
  customerId:   string
  customerName: string
  totalDebit:   number
  totalCredit:  number
  balance:      number   // positive = customer owes us
  oldestDueDays: number
}
