'use client'
import { useEffect, useState, type ReactNode } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { SuperAdminShell } from '@/components/layout/SuperAdminShell'
import { Card, SectionHeader } from '@/components/ui/Card'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/auth'

type AlertTone = 'success' | 'danger'

export default function SuperAdminSettingsPage() {
  const { token, user, login } = useAuthStore()
  const [alert, setAlert] = useState<{ tone: AlertTone; message: string } | null>(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')

  const profileQuery = useQuery({
    queryKey: ['super-admin', 'profile'],
    queryFn: () => api.get('/api/super-admin/profile').then((res) => res.data.data),
  })

  useEffect(() => {
    if (!profileQuery.data) return
    setName(profileQuery.data.name ?? '')
    setPhone(profileQuery.data.phone ?? '')
    setEmail(profileQuery.data.email ?? '')
  }, [profileQuery.data])

  const updateProfile = useMutation({
    mutationFn: (payload: { name: string; phone: string; email?: string }) =>
      api.patch('/api/super-admin/profile', payload).then((res) => res.data.data),
    onSuccess: (result) => {
      if (result?.session?.token && result?.session?.user) {
        login(result.session.token, result.session.user)
      } else if (token && user) {
        login(token, { ...user, name, role: 'SUPER_ADMIN', businessId: null, businessName: null, businessCity: null })
      }
      setAlert({ tone: 'success', message: 'Admin details updated successfully.' })
    },
    onError: (error: any) => {
      setAlert({ tone: 'danger', message: error?.response?.data?.error ?? 'Failed to update admin details.' })
    },
  })

  const updatePassword = useMutation({
    mutationFn: (payload: { currentPassword: string; newPassword: string }) =>
      api.patch('/api/super-admin/password', payload).then((res) => res.data.data),
    onSuccess: () => {
      setCurrentPassword('')
      setNewPassword('')
      setAlert({ tone: 'success', message: 'Password changed successfully.' })
    },
    onError: (error: any) => {
      setAlert({ tone: 'danger', message: error?.response?.data?.error ?? 'Failed to change password.' })
    },
  })

  return (
    <SuperAdminShell>
      <SectionHeader
        eyebrow="Account settings"
        title="Super Admin Settings"
        description="Update super admin profile and security credentials."
      />

      {alert ? (
        <div
          className={`mb-4 rounded-lg border px-4 py-2 text-sm ${
            alert.tone === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-950/30 dark:text-emerald-200'
              : 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-950/30 dark:text-rose-200'
          }`}
        >
          {alert.message}
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <div className="mb-4 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Admin profile</div>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              setAlert(null)
              const trimmedEmail = email.trim()
              updateProfile.mutate({
                name,
                phone,
                ...(trimmedEmail ? { email: trimmedEmail } : {}),
              })
            }}
            className="space-y-3"
          >
            <Field label="Name">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputCls}
                minLength={2}
                required
              />
            </Field>
            <Field label="Phone">
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                className={inputCls}
                maxLength={10}
                minLength={10}
                required
              />
            </Field>
            <Field label="Email">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputCls}
              />
            </Field>
            <div className="flex gap-2">
              <button type="submit" disabled={updateProfile.isPending || profileQuery.isLoading} className={saveBtnCls}>
                {updateProfile.isPending ? 'Saving...' : 'Save details'}
              </button>
            </div>
          </form>
        </Card>

        <Card>
          <div className="mb-4 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Password</div>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              setAlert(null)
              updatePassword.mutate({ currentPassword, newPassword })
            }}
            className="space-y-3"
          >
            <Field label="Current password">
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className={inputCls}
                minLength={6}
                required
              />
            </Field>
            <Field label="New password">
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className={inputCls}
                minLength={6}
                required
              />
            </Field>
            <div className="flex gap-2">
              <button type="submit" disabled={updatePassword.isPending} className={saveBtnCls}>
                {updatePassword.isPending ? 'Updating...' : 'Change password'}
              </button>
            </div>
          </form>
        </Card>
      </div>
    </SuperAdminShell>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">{label}</div>
      {children}
    </label>
  )
}

const inputCls =
  'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100'
const saveBtnCls =
  'rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400'
