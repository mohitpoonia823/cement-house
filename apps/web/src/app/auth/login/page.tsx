'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { api } from '@/lib/api'
import Link from 'next/link'

export default function LoginPage() {
  const [phone, setPhone]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const { login } = useAuthStore()
  const router    = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await api.post('/api/auth/login', { phone, password })
      login(res.data.data.token, res.data.data.user)
      router.replace('/dashboard')
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Login failed. Check credentials.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50 dark:bg-stone-950">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-2xl font-semibold text-stone-900 dark:text-stone-100">🏗️ Cement House</div>
          <div className="text-sm text-stone-500 mt-1">Sign in to your account</div>
        </div>
        <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-stone-600 dark:text-stone-400 mb-1">Phone number</label>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                placeholder="9876543210" maxLength={10}
                className="w-full px-3 py-2 text-sm border border-stone-200 dark:border-stone-700 rounded-lg bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required />
            </div>
            <div>
              <label className="block text-xs text-stone-600 dark:text-stone-400 mb-1">Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2 text-sm border border-stone-200 dark:border-stone-700 rounded-lg bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required />
            </div>
            {error && <div className="text-xs text-red-600 bg-red-50 dark:bg-red-950 rounded-lg px-3 py-2">{error}</div>}
            <button type="submit" disabled={loading}
              className="w-full py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>
        <div className="text-center text-xs text-stone-500 mt-4">
          New here?{' '}
          <Link href="/auth/register" className="text-blue-600 hover:underline font-medium">Create an account</Link>
        </div>
        <div className="text-center text-xs text-stone-400 mt-2">
          Construction material management platform
        </div>
      </div>
    </div>
  )
}
