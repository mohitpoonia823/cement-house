'use client'
import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { SuperAdminShell } from '@/components/layout/SuperAdminShell'
import { PaginationBar } from '@/components/super-admin/PaginationBar'
import { Badge } from '@/components/ui/Badge'
import { Card, MetricCard, MetricGrid, SectionHeader } from '@/components/ui/Card'
import { PageLoader } from '@/components/ui/Spinner'
import { useSuperAdminUsers } from '@/lib/super-admin'
import { api } from '@/lib/api'
import { fmtDate } from '@/lib/utils'

export default function SuperAdminUsersPage() {
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [role, setRole] = useState<'' | 'SUPER_ADMIN' | 'OWNER' | 'MUNIM'>('')

  const [editingUserId, setEditingUserId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const [draftPhone, setDraftPhone] = useState('')
  const [draftEmail, setDraftEmail] = useState('')
  const [draftRole, setDraftRole] = useState<'SUPER_ADMIN' | 'OWNER' | 'MUNIM'>('OWNER')
  const [draftActive, setDraftActive] = useState(true)
  const [draftPermissions, setDraftPermissions] = useState<string[]>([])
  const [draftPassword, setDraftPassword] = useState('')
  const [editError, setEditError] = useState('')

  const { data, isLoading } = useSuperAdminUsers({ page, pageSize: 8, search, role })

  const items = data?.items ?? []
  const superAdmins = items.filter((user) => user.role === 'SUPER_ADMIN').length
  const owners = items.filter((user) => user.role === 'OWNER').length
  const munims = items.filter((user) => user.role === 'MUNIM').length

  const permissionOptions = ['orders', 'customers', 'inventory', 'delivery', 'ledger']

  const updateUser = useMutation({
    mutationFn: (payload: {
      userId: string
      name: string
      phone: string
      email?: string
      role: 'SUPER_ADMIN' | 'OWNER' | 'MUNIM'
      isActive: boolean
      permissions: string[]
      password?: string
    }) =>
      api
        .patch(`/api/super-admin/users/${payload.userId}`, {
          name: payload.name,
          phone: payload.phone,
          ...(payload.email ? { email: payload.email } : {}),
          role: payload.role,
          isActive: payload.isActive,
          permissions: payload.permissions,
          ...(payload.password ? { password: payload.password } : {}),
        })
        .then((res) => res.data.data),
    onSuccess: () => {
      setEditingUserId(null)
      setDraftPassword('')
      setEditError('')
      qc.invalidateQueries({ queryKey: ['super-admin', 'users'] })
    },
    onError: (error: any) => {
      setEditError(error?.response?.data?.error ?? 'Failed to update user')
    },
  })

  if (isLoading) {
    return (
      <SuperAdminShell>
        <PageLoader />
      </SuperAdminShell>
    )
  }

  return (
    <SuperAdminShell>
      <SectionHeader
        eyebrow="User directory"
        title="Browse platform users without overload"
        description="Use filters and pagination to manage large user volumes across owners, munims, and platform admins."
      />

      <MetricGrid className="mb-6">
        <MetricCard label="Users on this page" value={String(items.length)} hint={`${data?.total ?? 0} total matched users`} tone="brand" />
        <MetricCard label="Super Admin" value={String(superAdmins)} hint="Visible on current page" tone="info" />
        <MetricCard label="Owners" value={String(owners)} hint="Business owners on this page" tone="success" />
        <MetricCard label="Munims" value={String(munims)} hint="Staff users on this page" tone="default" />
      </MetricGrid>

      <Card className="mb-6">
        <div className="grid gap-4 lg:grid-cols-[1.5fr_0.9fr_auto]">
          <label className="block">
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Search user</div>
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setPage(1)
                  setSearch(searchInput.trim())
                }
              }}
              placeholder="Search by name, phone, or business"
              className={inputCls}
            />
          </label>
          <label className="block">
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Role</div>
            <select
              value={role}
              onChange={(e) => {
                setPage(1)
                setRole(e.target.value as '' | 'SUPER_ADMIN' | 'OWNER' | 'MUNIM')
              }}
              className={inputCls}
            >
              <option value="">All roles</option>
              <option value="SUPER_ADMIN">Super Admin</option>
              <option value="OWNER">Owner</option>
              <option value="MUNIM">Munim</option>
            </select>
          </label>
          <div className="flex items-end gap-2">
            <button
              onClick={() => {
                setPage(1)
                setSearch(searchInput.trim())
              }}
              className="rounded-full bg-slate-950 px-4 py-3 text-xs font-semibold text-white dark:bg-white dark:text-slate-950"
            >
              Apply filters
            </button>
          </div>
        </div>
      </Card>

      <div className="space-y-4">
        {items.map((user) => (
          <Card key={user.id}>
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-lg font-semibold tracking-tight text-slate-950 dark:text-white">{user.name}</div>
                  <Badge variant={user.isActive ? 'success' : 'danger'}>{user.isActive ? 'ACTIVE' : 'INACTIVE'}</Badge>
                  <Badge variant={user.role === 'SUPER_ADMIN' ? 'info' : user.role === 'OWNER' ? 'success' : 'default'}>{user.role}</Badge>
                  {user.businessActive === false && <Badge variant="warning">BUSINESS SUSPENDED</Badge>}
                </div>
                <div className="mt-2 text-sm text-slate-500 dark:text-slate-300">
                  {user.phone}  -  {user.businessName ? `${user.businessName}${user.businessCity ? `, ${user.businessCity}` : ''}` : 'Platform account'}
                </div>
                <div className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                  Last seen {user.lastSeenAt ? fmtDate(user.lastSeenAt) : 'never'}  -  Created {fmtDate(user.createdAt)}
                </div>
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingUserId(user.id)
                      setDraftName(user.name)
                      setDraftPhone(user.phone)
                      setDraftEmail(user.email ?? '')
                      setDraftRole(user.role)
                      setDraftActive(user.isActive)
                      setDraftPermissions(user.permissions ?? [])
                      setDraftPassword('')
                      setEditError('')
                    }}
                    className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:border-slate-600 dark:text-slate-200"
                  >
                    Edit user
                  </button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <MiniInfo label="Permissions" value={user.permissions.length > 0 ? user.permissions.join(', ') : 'No scoped permissions'} />
                <MiniInfo
                  label="Business"
                  value={user.businessName ? user.businessName : 'Platform-level account'}
                  action={
                    user.businessId ? (
                      <Link href="/super-admin/businesses" className="text-xs font-semibold text-emerald-700 hover:underline dark:text-emerald-300">
                        View businesses
                      </Link>
                    ) : null
                  }
                />
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-6">
        <PaginationBar page={data?.page ?? 1} totalPages={data?.totalPages ?? 1} total={data?.total ?? 0} label="users" onPageChange={setPage} />
      </div>

      {editingUserId ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-4 sm:items-center">
          <div className="w-full max-w-2xl rounded-[24px] border border-white/70 bg-white p-4 shadow-[0_30px_80px_rgba(15,23,42,0.25)] dark:border-slate-700 dark:bg-slate-950">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-lg font-semibold text-slate-950 dark:text-slate-100">Update user</div>
              <button type="button" onClick={() => setEditingUserId(null)} className="rounded-full border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:border-slate-600 dark:text-slate-300">
                Close
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name">
                <input value={draftName} onChange={(e) => setDraftName(e.target.value)} className={inputCls} />
              </Field>
              <Field label="Phone">
                <input value={draftPhone} onChange={(e) => setDraftPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} className={inputCls} />
              </Field>
              <Field label="Email">
                <input type="email" value={draftEmail} onChange={(e) => setDraftEmail(e.target.value)} className={inputCls} />
              </Field>
              <Field label="Role">
                <select value={draftRole} onChange={(e) => setDraftRole(e.target.value as 'SUPER_ADMIN' | 'OWNER' | 'MUNIM')} className={inputCls}>
                  <option value="SUPER_ADMIN">SUPER_ADMIN</option>
                  <option value="OWNER">OWNER</option>
                  <option value="MUNIM">MUNIM</option>
                </select>
              </Field>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Status</span>
              <button
                type="button"
                onClick={() => setDraftActive((prev) => !prev)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                  draftActive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200' : 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-200'
                }`}
              >
                {draftActive ? 'Active' : 'Inactive'}
              </button>
            </div>

            <div className="mt-3">
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Permissions</div>
              <div className="flex flex-wrap gap-2">
                {permissionOptions.map((id) => {
                  const on = draftPermissions.includes(id)
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setDraftPermissions((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                        on
                          ? 'border-slate-950 bg-slate-950 text-white dark:border-sky-400 dark:bg-sky-400 dark:text-slate-950'
                          : 'border-slate-300 text-slate-700 dark:border-slate-600 dark:text-slate-200'
                      }`}
                    >
                      {id}
                    </button>
                  )
                })}
              </div>
            </div>

            <Field label="Reset password (optional)">
              <input
                type="password"
                value={draftPassword}
                onChange={(e) => setDraftPassword(e.target.value)}
                className={inputCls}
                placeholder="Leave empty to keep existing password"
              />
            </Field>

            {editError ? <div className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:bg-rose-500/10 dark:text-rose-200">{editError}</div> : null}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingUserId(null)}
                className="rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-600 dark:border-slate-600 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={updateUser.isPending}
                onClick={() => {
                  const name = draftName.trim()
                  const phone = draftPhone.trim()
                  if (name.length < 2 || phone.length !== 10) {
                    setEditError('Please provide valid name and 10-digit phone')
                    return
                  }
                  if (draftPassword && draftPassword.length < 6) {
                    setEditError('Password must be at least 6 characters')
                    return
                  }
                  updateUser.mutate({
                    userId: editingUserId,
                    name,
                    phone,
                    email: draftEmail.trim() || undefined,
                    role: draftRole,
                    isActive: draftActive,
                    permissions: draftPermissions,
                    password: draftPassword || undefined,
                  })
                }}
                className="rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold text-white dark:bg-white dark:text-slate-950"
              >
                {updateUser.isPending ? 'Saving...' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </SuperAdminShell>
  )
}

function MiniInfo({ label, value, action }: { label: string; value: string; action?: ReactNode }) {
  return (
    <div className="rounded-[20px] border border-slate-200/70 px-4 py-3 dark:border-slate-800">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-2 text-sm font-medium text-slate-950 dark:text-white">{value}</div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="mt-3 block">
      <div className="mb-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">{label}</div>
      {children}
    </label>
  )
}

const inputCls =
  'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100'
