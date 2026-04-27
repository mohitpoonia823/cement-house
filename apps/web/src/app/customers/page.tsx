'use client'
import { AppShell } from '@/components/layout/AppShell'
import { Card, MetricCard, MetricGrid, SectionHeader } from '@/components/ui/Card'
import { Badge, statusBadge } from '@/components/ui/Badge'
import { PageLoader } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { useCustomers, useCreateCustomer, useUpdateCustomer, useDeleteCustomer, useBulkDeleteCustomers, useSendReminders } from '@/hooks/useCustomers'
import { fmt } from '@/lib/utils'
import { useState } from 'react'
import Link from 'next/link'

const RISK_TAGS = ['ALL', 'RELIABLE', 'WATCH', 'BLOCKED']

type CustomerForm = {
  name: string
  phone: string
  address: string
  creditLimit: string
  riskTag: string
}

const emptyForm: CustomerForm = {
  name: '',
  phone: '',
  address: '',
  creditLimit: '',
  riskTag: 'RELIABLE',
}

export default function CustomersPage() {
  const [riskTag, setRiskTag] = useState('ALL')
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)

  const { data: customers, isLoading } = useCustomers({
    riskTag: riskTag === 'ALL' ? undefined : riskTag,
    search: search || undefined,
  })

  const createCustomer = useCreateCustomer()
  const updateCustomer = useUpdateCustomer()
  const deleteCustomer = useDeleteCustomer()
  const bulkDelete = useBulkDeleteCustomers()
  const sendReminders = useSendReminders()

  const [form, setForm] = useState<CustomerForm>(emptyForm)
  const [formError, setFormError] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const list = customers ?? []
  const allSelected = list.length > 0 && selected.size === list.length

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(list.map((c: any) => c.id)))
    }
  }

  function openCreateForm() {
    setEditId(null)
    setForm(emptyForm)
    setFormError('')
    setShowForm(true)
  }

  function handleDelete(id: string, name: string) {
    if (!confirm(`Delete customer "${name}"? This will deactivate the customer.`)) return
    deleteCustomer.mutate(id, {
      onSuccess: () =>
        setSelected((prev) => {
          const n = new Set(prev)
          n.delete(id)
          return n
        }),
    })
  }

  function handleBulkDelete() {
    if (!confirm(`Delete ${selected.size} selected customer(s)? They will be deactivated.`)) return
    bulkDelete.mutate([...selected], { onSuccess: () => setSelected(new Set()) })
  }

  function handleBulkRemind() {
    if (!confirm(`Send automated WhatsApp reminders to ${selected.size} selected customer(s)?`)) return
    sendReminders.mutate([...selected], {
      onSuccess: (res) => {
        alert(`Successfully sent ${res.data.sent} reminders.`)
        setSelected(new Set())
      },
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    try {
      if (editId) {
        await updateCustomer.mutateAsync({ id: editId, ...form, creditLimit: Number(form.creditLimit || 0) })
      } else {
        await createCustomer.mutateAsync({ ...form, creditLimit: Number(form.creditLimit || 0) })
      }
      setShowForm(false)
      setEditId(null)
      setForm(emptyForm)
    } catch (err: any) {
      setFormError(err.response?.data?.error ?? 'Failed')
    }
  }

  function handleEditClick(c: any) {
    setForm({
      name: c.name,
      phone: c.phone,
      address: c.address ?? '',
      creditLimit: String(Number(c.creditLimit)),
      riskTag: c.riskTag ?? 'RELIABLE',
    })
    setEditId(c.id)
    setFormError('')
    setShowForm(true)
    if (window.innerWidth >= 1280) {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  function handleCancel() {
    setShowForm(false)
    setEditId(null)
    setForm(emptyForm)
    setFormError('')
  }

  const formFields = [
    { label: 'Name *', key: 'name', type: 'text', placeholder: 'Rajesh Builders' },
    { label: 'Phone *', key: 'phone', type: 'tel', placeholder: '9876543210' },
    { label: 'Address', key: 'address', type: 'text', placeholder: 'Sector 7, Hisar' },
    { label: 'Credit limit (Rs)', key: 'creditLimit', type: 'number', placeholder: '100000' },
  ] as const

  return (
    <AppShell>
      <SectionHeader
        eyebrow="Customer analytics"
        title="Customer intelligence"
        description="Monitor outstanding exposure, risky accounts, reminder campaigns, and relationship value from one view."
        action={
          <button
            onClick={openCreateForm}
            className="rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-sky-500 dark:text-slate-950"
          >
            + Add customer
          </button>
        }
      />

      <MetricGrid className="mb-6">
        <MetricCard label="Customers in view" value={String(list.length)} hint="Filtered active accounts" />
        <MetricCard
          label="Outstanding"
          value={fmt(list.reduce((sum: number, c: any) => sum + Math.max(0, Number(c.balance)), 0))}
          hint="Open exposure across selected customers"
          tone="warning"
        />
        <MetricCard
          label="High risk"
          value={String(list.filter((c: any) => c.riskTag !== 'RELIABLE').length)}
          hint="Watch + blocked accounts"
          tone="danger"
        />
        <MetricCard
          label="Order relationships"
          value={String(list.reduce((sum: number, c: any) => sum + Number(c.orderCount), 0))}
          hint="Lifetime order count in current list"
          tone="brand"
        />
      </MetricGrid>

      <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap gap-2">
          {RISK_TAGS.map((t) => (
            <button
              key={t}
              onClick={() => {
                setRiskTag(t)
                setSelected(new Set())
              }}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition-colors ${
                riskTag === t
                  ? 'bg-slate-950 text-white dark:bg-sky-500 dark:text-slate-950'
                  : 'border border-slate-200 bg-white/75 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex max-w-full flex-1 gap-2 xl:max-w-xs">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name..."
            className="flex-1 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs text-stone-900 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
          />
        </div>
      </div>

      {showForm && (
        <Card className="mb-4 hidden xl:block">
          <div className="mb-3 text-xs font-medium uppercase tracking-wide text-stone-500">{editId ? 'Edit customer' : 'New customer'}</div>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {formFields.map((f) => (
              <div key={f.key}>
                <label className="mb-1 block text-xs text-stone-500">{f.label}</label>
                <input
                  type={f.type}
                  placeholder={f.placeholder}
                  value={(form as any)[f.key]}
                  onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
                  className="w-full rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-xs text-stone-900 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
                  required={f.key === 'name' || f.key === 'phone'}
                />
              </div>
            ))}
            <div>
              <label className="mb-1 block text-xs text-stone-500">Risk Tag</label>
              <select
                value={form.riskTag}
                onChange={(e) => setForm((p) => ({ ...p, riskTag: e.target.value }))}
                className="w-full rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-xs text-stone-900 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
              >
                <option value="RELIABLE">Reliable</option>
                <option value="WATCH">Watch</option>
                <option value="BLOCKED">Blocked</option>
              </select>
            </div>
            <div className="col-span-1 mt-2 flex flex-wrap gap-2 sm:col-span-2 xl:col-span-4">
              <button
                type="submit"
                disabled={createCustomer.isPending || updateCustomer.isPending}
                className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {createCustomer.isPending || updateCustomer.isPending ? 'Saving...' : 'Save customer'}
              </button>
              <button type="button" onClick={handleCancel} className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs hover:bg-stone-50">
                Cancel
              </button>
            </div>
            {formError && <div className="col-span-1 text-xs text-red-600 sm:col-span-2 xl:col-span-4">{formError}</div>}
          </form>
        </Card>
      )}

      {showForm && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-950/45 p-3 xl:hidden" onClick={handleCancel}>
          <div className="max-h-[88vh] w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <div className="text-xs font-medium uppercase tracking-wide text-stone-500">{editId ? 'Edit customer' : 'New customer'}</div>
              <button
                type="button"
                onClick={handleCancel}
                className="rounded-md border border-stone-200 px-2 py-1 text-xs text-stone-600 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
              >
                Close
              </button>
            </div>
            <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3">
              {formFields.map((f) => (
                <div key={f.key}>
                  <label className="mb-1 block text-xs text-stone-500">{f.label}</label>
                  <input
                    type={f.type}
                    placeholder={f.placeholder}
                    value={(form as any)[f.key]}
                    onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
                    className="w-full rounded-lg border border-stone-200 bg-white px-2 py-2 text-sm text-stone-900 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
                    required={f.key === 'name' || f.key === 'phone'}
                  />
                </div>
              ))}
              <div>
                <label className="mb-1 block text-xs text-stone-500">Risk Tag</label>
                <select
                  value={form.riskTag}
                  onChange={(e) => setForm((p) => ({ ...p, riskTag: e.target.value }))}
                  className="w-full rounded-lg border border-stone-200 bg-white px-2 py-2 text-sm text-stone-900 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
                >
                  <option value="RELIABLE">Reliable</option>
                  <option value="WATCH">Watch</option>
                  <option value="BLOCKED">Blocked</option>
                </select>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={createCustomer.isPending || updateCustomer.isPending}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {createCustomer.isPending || updateCustomer.isPending ? 'Saving...' : 'Save customer'}
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="rounded-lg border border-stone-200 px-3 py-2 text-xs hover:bg-stone-50 dark:border-stone-700 dark:hover:bg-stone-800"
                >
                  Cancel
                </button>
              </div>
              {formError && <div className="text-xs text-red-600">{formError}</div>}
            </form>
          </div>
        </div>
      )}

      {selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 dark:border-blue-900 dark:bg-blue-950/20">
          <span className="w-auto text-xs font-medium text-blue-800 dark:text-blue-200">
            {selected.size} customer{selected.size > 1 ? 's' : ''} selected
          </span>
          <div className="overflow-hidden rounded-md border border-stone-200 bg-white shadow-sm dark:border-stone-700 dark:bg-stone-800">
            <button
              onClick={handleBulkRemind}
              disabled={sendReminders.isPending}
              className="border-r border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-700 transition-colors hover:bg-stone-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-700"
            >
              {sendReminders.isPending ? 'Sending...' : 'Send Reminders'}
            </button>
            <button
              onClick={handleBulkDelete}
              disabled={bulkDelete.isPending}
              className="px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 dark:hover:bg-red-950/30"
            >
              {bulkDelete.isPending ? 'Deleting...' : 'Delete'}
            </button>
          </div>
          <button onClick={() => setSelected(new Set())} className="ml-0 text-xs text-stone-500 hover:text-stone-700 dark:text-stone-400 md:ml-auto">
            Clear selection
          </button>
        </div>
      )}

      <Card>
        {isLoading ? (
          <PageLoader />
        ) : list.length === 0 ? (
          <EmptyState title="No customers found" sub="Add your first customer to get started" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-xs">
              <thead>
                <tr className="border-b border-slate-200/70 dark:border-slate-800">
                  <th className="w-8 py-2 pr-2 text-left">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      className="cursor-pointer rounded border-stone-300 text-blue-600 focus:ring-blue-500"
                    />
                  </th>
                  {['Name', 'Phone', 'Address', 'Credit limit', 'Outstanding', 'Orders', 'Risk', ''].map((h) => (
                    <th key={h} className="py-3 pr-3 text-left font-normal uppercase tracking-[0.18em] text-slate-400">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.map((c: any) => {
                  const isSelected = selected.has(c.id)
                  return (
                    <tr
                      key={c.id}
                      className={`last:border-0 border-b border-stone-50 transition-colors dark:border-stone-800 ${
                        isSelected ? 'bg-sky-50 dark:bg-sky-950/30' : 'hover:bg-slate-50/80 dark:hover:bg-slate-900/40'
                      }`}
                    >
                      <td className="py-2.5 pr-2">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleOne(c.id)}
                          className="cursor-pointer rounded border-stone-300 text-blue-600 focus:ring-blue-500"
                        />
                      </td>
                      <td className="py-2.5 pr-3 font-medium text-stone-800 dark:text-stone-200">{c.name}</td>
                      <td className="py-2.5 pr-3 text-stone-500">{c.phone}</td>
                      <td className="max-w-32 truncate py-2.5 pr-3 text-stone-500">{c.address ?? '-'}</td>
                      <td className="py-2.5 pr-3">{fmt(Number(c.creditLimit))}</td>
                      <td className={`py-2.5 pr-3 font-medium ${c.balance > 0 ? 'text-red-600 dark:text-red-400' : 'text-stone-400'}`}>
                        {c.balance > 0 ? fmt(c.balance) : '-'}
                      </td>
                      <td className="py-2.5 pr-3 text-stone-500">{c.orderCount}</td>
                      <td className="py-2.5 pr-3">
                        <Badge variant={statusBadge(c.riskTag)}>{c.riskTag}</Badge>
                      </td>
                      <td className="py-2.5">
                        <div className="flex gap-2">
                          <Link href={`/khata?customer=${c.id}`} className="text-blue-500 hover:underline">
                            Khata
                          </Link>
                          <button onClick={() => handleEditClick(c)} className="text-stone-500 transition-colors hover:text-stone-700">
                            Edit
                          </button>
                          <button onClick={() => handleDelete(c.id, c.name)} className="text-red-400 transition-colors hover:text-red-600">
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </AppShell>
  )
}
