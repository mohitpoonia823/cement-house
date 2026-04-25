/**
 * Central Axios instance — attaches JWT token from localStorage automatically.
 * All API calls go through this single client.
 */
import axios from 'axios'

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
  timeout: 15_000,
})

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
