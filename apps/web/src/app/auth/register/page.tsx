'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { api } from '@/lib/api'
import Link from 'next/link'

export default function RegisterPage() {
  const [name, setName]                 = useState('')
  const [phone, setPhone]               = useState('')
  const [password, setPassword]         = useState('')
  const [businessName, setBusinessName] = useState('')
  const [city, setCity]                 = useState('')
  const [error, setError]               = useState('')
  const [loading, setLoading]           = useState(false)
  const { login } = useAuthStore()
  const router    = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 6) return setError('Password must be at least 6 characters')
    setLoading(true)
    try {
      const res = await api.post('/api/auth/register', {
        name, phone, password, role: 'OWNER', businessName, city,
      })
      login(res.data.data.token, res.data.data.user)
      router.replace('/dashboard')
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Registration failed. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50 dark:bg-stone-950 py-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-2xl font-semibold text-stone-900 dark:text-stone-100">🏗️ Cement House</div>
          <div className="text-sm text-stone-500 mt-1">Create your business account</div>
        </div>
        <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Business info */}
            <div className="text-xs font-medium text-stone-500 uppercase tracking-wide">Your Business</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-stone-600 dark:text-stone-400 mb-1">Business name *</label>
                <input type="text" value={businessName} onChange={e => setBusinessName(e.target.value)}
                  placeholder="e.g. Sharma Cement Store" required
                  className="w-full px-3 py-2 text-sm border border-stone-200 dark:border-stone-700 rounded-lg bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs text-stone-600 dark:text-stone-400 mb-1">City *</label>
                <input type="text" value={city} onChange={e => setCity(e.target.value)}
                  placeholder="e.g. Hisar" required
                  className="w-full px-3 py-2 text-sm border border-stone-200 dark:border-stone-700 rounded-lg bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>

            <div className="border-t border-stone-100 dark:border-stone-800 pt-4">
              <div className="text-xs font-medium text-stone-500 uppercase tracking-wide mb-3">Your Details</div>
            </div>
            <div>
              <label className="block text-xs text-stone-600 dark:text-stone-400 mb-1">Full name *</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)}
                placeholder="Ramesh Kumar" required
                className="w-full px-3 py-2 text-sm border border-stone-200 dark:border-stone-700 rounded-lg bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-stone-600 dark:text-stone-400 mb-1">Phone number *</label>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                placeholder="9876543210" maxLength={10} required
                className="w-full px-3 py-2 text-sm border border-stone-200 dark:border-stone-700 rounded-lg bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-stone-600 dark:text-stone-400 mb-1">Password *</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="Min 6 characters" required
                className="w-full px-3 py-2 text-sm border border-stone-200 dark:border-stone-700 rounded-lg bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            {error && <div className="text-xs text-red-600 bg-red-50 dark:bg-red-950 rounded-lg px-3 py-2">{error}</div>}
            <button type="submit" disabled={loading}
              className="w-full py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {loading ? 'Creating account…' : 'Create account'}
            </button>
          </form>
        </div>
        <div className="text-center text-xs text-stone-500 mt-4">
          Already have an account?{' '}
          <Link href="/auth/login" className="text-blue-600 hover:underline font-medium">Sign in</Link>
        </div>
        <div className="text-center text-xs text-stone-400 mt-2">
          Construction material management platform
        </div>
      </div>
    </div>
  )
}
