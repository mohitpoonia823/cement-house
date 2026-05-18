/**
 * Central Axios instance — attaches JWT token from localStorage automatically.
 * All API calls go through this single client.
 */
import axios from 'axios'
import type { AxiosRequestConfig, AxiosResponse } from 'axios'

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
  timeout: 15_000,
})

const GET_CACHE_TTL_MS = 10_000
const getCache = new Map<string, { expiresAt: number; response: AxiosResponse }>()
const inflightGet = new Map<string, Promise<AxiosResponse>>()

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return String(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
  return `{${entries.map(([key, val]) => `${key}:${stableStringify(val)}`).join(',')}}`
}

function buildGetKey(url: string, config?: AxiosRequestConfig): string {
  const base = config?.baseURL ?? api.defaults.baseURL ?? ''
  const params = config?.params ? stableStringify(config.params) : ''
  return `${base}|${url}|${params}`
}

export function invalidateGetCache(match?: string | RegExp | ((key: string) => boolean)) {
  const test =
    typeof match === 'function'
      ? match
      : match instanceof RegExp
        ? (key: string) => match.test(key)
        : typeof match === 'string' && match.length > 0
          ? (key: string) => key.includes(match)
          : () => true

  for (const key of getCache.keys()) {
    if (test(key)) getCache.delete(key)
  }
  for (const key of inflightGet.keys()) {
    if (test(key)) inflightGet.delete(key)
  }
}

// Backward-compatible alias used by existing hooks.
export const clearCachedGets = invalidateGetCache

function shouldSkipGetCache(config?: AxiosRequestConfig): boolean {
  const headerControl = String((config?.headers as any)?.['Cache-Control'] ?? '')
  const meta = (config as any)?.meta ?? {}
  return meta?.skipCache === true || headerControl.includes('no-cache')
}

const baseGet = api.get.bind(api)
;(api as any).get = function cachedGet(url: string, config?: AxiosRequestConfig) {
  if (typeof window === 'undefined') {
    return baseGet(url, config)
  }

  const skipCache = shouldSkipGetCache(config)
  const cacheKey = buildGetKey(url, config)
  const cacheTtl = Number((config as any)?.meta?.cacheTtlMs ?? GET_CACHE_TTL_MS)

  if (!skipCache) {
    const hit = getCache.get(cacheKey)
    if (hit && hit.expiresAt > Date.now()) {
      return Promise.resolve({
        ...hit.response,
        config: config ?? hit.response.config,
      } as AxiosResponse)
    }
    const inflight = inflightGet.get(cacheKey)
    if (inflight) return inflight
  }

  const requestPromise: Promise<AxiosResponse> = baseGet(url, config)
    .then((response) => {
      if (!skipCache && response.status >= 200 && response.status < 300) {
        getCache.set(cacheKey, { expiresAt: Date.now() + cacheTtl, response })
      }
      return response
    })
    .finally(() => {
      inflightGet.delete(cacheKey)
    })

  if (!skipCache) inflightGet.set(cacheKey, requestPromise)
  return requestPromise
}

// Attach JWT on every request
api.interceptors.request.use((config) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Redirect to /login on 401
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const reqUrl = String(err.config?.url ?? '')
    const isAuthRoute = reqUrl.includes('/api/auth/')
    if (err.response?.status === 402 && typeof window !== 'undefined') {
      const code = err.response?.data?.code ?? ''
      if (code === 'SUBSCRIPTION_REQUIRED') {
        const message = err.response?.data?.error ?? 'Your workspace is locked until a subscription is activated.'
        sessionStorage.setItem('auth_logout_reason', message)
        const role = err.response?.data?.data?.role ?? ''
        if (role === 'OWNER') {
          if (!window.location.pathname.startsWith('/settings')) {
            window.location.href = '/settings?subscription=required'
          }
        } else {
          localStorage.removeItem('auth_token')
          localStorage.removeItem('cement-house-auth')
          window.location.href = '/auth/login'
        }
      }
    }
    if (err.response?.status === 401 && !isAuthRoute && typeof window !== 'undefined') {
      const message = err.response?.data?.error ?? 'Your session has expired. Please sign in again.'
      localStorage.removeItem('auth_token')
      localStorage.removeItem('cement-house-auth')
      sessionStorage.setItem('auth_logout_reason', message)
      window.location.href = '/auth/login'
    }
    return Promise.reject(err)
  }
)
