'use client'
import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { SuperAdminShell } from '@/components/layout/SuperAdminShell'
import { PaginationBar } from '@/components/super-admin/PaginationBar'
import { Badge } from '@/components/ui/Badge'
import { Card, MetricCard, MetricGrid, SectionHeader } from '@/components/ui/Card'
import { PageLoader } from '@/components/ui/Spinner'
import { useSuperAdminUsers } from '@/lib/super-admin'
import { fmtDate } from '@/lib/utils'

export default function SuperAdminUsersPage() {
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [role, setRole] = useState<'' | 'SUPER_ADMIN' | 'OWNER' | 'MUNIM'>('')
  const { data, isLoading } = useSuperAdminUsers({ page, pageSize: 8, search, role })

  const items = data?.items ?? []
  const superAdmins = items.filter((user) => user.role === 'SUPER_ADMIN').length
  const owners = items.filter((user) => user.role === 'OWNER').length
  const munims = items.filter((user) => user.role === 'MUNIM').length

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
                  <Badge variant={user.role === 'SUPER_ADMIN' ? 'info' : user.role === 'OWNER' ? 'success' : 'default'}>
                    {user.role}
                  </Badge>
                  {user.businessActive === false && <Badge variant="warning">BUSINESS SUSPENDED</Badge>}
                </div>
                <div className="mt-2 text-sm text-slate-500 dark:text-slate-300">
                  {user.phone} • {user.businessName ? `${user.businessName}${user.businessCity ? `, ${user.businessCity}` : ''}` : 'Platform account'}
                </div>
                <div className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                  Last seen {user.lastSeenAt ? fmtDate(user.lastSeenAt) : 'never'} • Created {fmtDate(user.createdAt)}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <MiniInfo label="Permissions" value={user.permissions.length > 0 ? user.permissions.join(', ') : 'No scoped permissions'} />
                <MiniInfo
                  label="Business"
                  value={user.businessName ? user.businessName : 'Platform-level account'}
                  action={user.businessId ? <Link href="/super-admin/businesses" className="text-xs font-semibold text-emerald-700 hover:underline dark:text-emerald-300">View businesses</Link> : null}
                />
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-6">
        <PaginationBar
          page={data?.page ?? 1}
          totalPages={data?.totalPages ?? 1}
          total={data?.total ?? 0}
          label="users"
          onPageChange={setPage}
        />
      </div>
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

const inputCls =
  'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100'
