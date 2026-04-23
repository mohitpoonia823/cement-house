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
    if (err.response?.status === 401 && typeof window !== 'undefined') {
      const message = err.response?.data?.error ?? 'Your session has expired. Please sign in again.'
      localStorage.removeItem('auth_token')
      localStorage.removeItem('cement-house-auth')
      sessionStorage.setItem('auth_logout_reason', message)
      window.location.href = '/auth/login'
    }
    return Promise.reject(err)
  }
)
