import { useQuery } from '@tanstack/react-query'
import { api } from './api'

export type BusinessListItem = {
  id: string
  name: string
  city: string
  phone: string | null
  gstin: string | null
  isActive: boolean
  suspendedReason: string | null
  subscriptionPlan: 'STARTER' | 'PRO' | 'ENTERPRISE'
  subscriptionStatus: 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'SUSPENDED'
  subscriptionEndsAt: string | null
  subscriptionInterval: 'MONTHLY' | 'YEARLY' | null
  trialDaysOverride: number | null
  monthlySubscriptionAmount: number
  yearlySubscriptionAmount: number
  createdAt: string
  updatedAt: string
  ownerName: string | null
  ownerPhone: string | null
  totalUsers: number
  totalCustomers: number
  totalOrders: number
  gmv: number
  outstanding: number
}

export type UserListItem = {
  id: string
  name: string
  phone: string
  email?: string | null
  role: 'SUPER_ADMIN' | 'OWNER' | 'MUNIM'
  isActive: boolean
  permissions: string[]
  lastSeenAt: string | null
  createdAt: string
  businessId: string | null
  businessName: string | null
  businessCity: string | null
  businessActive: boolean | null
}

export type PaginatedResponse<T> = {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export type BillingConfig = {
  trialDays: number
  monthlyPrice: number
  yearlyPrice: number
  currency: string
  trialRequiresCard: boolean
}

export type AnalyticsRange = '1M' | '3M' | '6M' | '1Y' | 'CUSTOM'

export type SuperAdminOverviewAnalytics = {
  range: AnalyticsRange
  startDate: string
  endDate: string
  summary: {
    gmv: number
    subscriptionRevenue: number
    newBusinesses: number
    activeUsers: number
    totalSubscriptionRevenueTillDate: number
  }
  points: Array<{
    date: string
    gmv: number
    subscriptionRevenue: number
    newBusinesses: number
    activeUsers: number
  }>
}

type ListParams = Record<string, string | number | undefined>

function buildQuery(params: ListParams) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue
    search.set(key, String(value))
  }
  return search.toString()
}

export function useSuperAdminOverview() {
  return useQuery({
    queryKey: ['super-admin', 'overview'],
    queryFn: () => api.get('/api/super-admin/overview').then((res) => res.data.data),
    refetchInterval: 60_000,
  })
}

export function useSuperAdminOverviewAnalytics(params: {
  range: AnalyticsRange
  startDate?: string
  endDate?: string
}) {
  const query = buildQuery(params)
  return useQuery({
    queryKey: ['super-admin', 'overview-analytics', query],
    queryFn: () => api.get(`/api/super-admin/overview-analytics?${query}`).then((res) => res.data.data as SuperAdminOverviewAnalytics),
    placeholderData: (prev) => prev,
  })
}

export function useSuperAdminBillingConfig() {
  return useQuery({
    queryKey: ['super-admin', 'billing-config'],
    queryFn: () => api.get('/api/super-admin/billing-config').then((res) => res.data.data as BillingConfig),
  })
}

export function useSuperAdminBusinesses(params: {
  page: number
  pageSize: number
  search?: string
  status?: 'ACTIVE' | 'SUSPENDED' | ''
}) {
  const query = buildQuery(params)
  return useQuery({
    queryKey: ['super-admin', 'businesses', query],
    queryFn: () => api.get(`/api/super-admin/businesses?${query}`).then((res) => res.data.data as PaginatedResponse<BusinessListItem>),
    placeholderData: (prev) => prev,
  })
}

export function useSuperAdminUsers(params: {
  page: number
  pageSize: number
  search?: string
  role?: 'SUPER_ADMIN' | 'OWNER' | 'MUNIM' | ''
  sortBy?: 'createdAt' | 'name' | 'role' | 'status' | 'business'
  sortOrder?: 'asc' | 'desc'
}) {
  const query = buildQuery(params)
  return useQuery({
    queryKey: ['super-admin', 'users', query],
    queryFn: () => api.get(`/api/super-admin/users?${query}`).then((res) => res.data.data as PaginatedResponse<UserListItem>),
    placeholderData: (prev) => prev,
  })
}
