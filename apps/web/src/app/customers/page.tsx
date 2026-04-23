'use client'
import { AppShell }      from '@/components/layout/AppShell'
import { Card }          from '@/components/ui/Card'
import { Badge, statusBadge } from '@/components/ui/Badge'
import { PageLoader }    from '@/components/ui/Spinner'
import { EmptyState }    from '@/components/ui/EmptyState'
import { useCustomers, useCreateCustomer, useUpdateCustomer, useDeleteCustomer, useBulkDeleteCustomers, useSendReminders } from '@/hooks/useCustomers'
import { fmt }           from '@/lib/utils'
import { useState }      from 'react'
import Link              from 'next/link'

const RISK_TAGS = ['ALL','RELIABLE','WATCH','BLOCKED']

export default function CustomersPage() {
  const [riskTag, setRiskTag] = useState('ALL')
  const [search,  setSearch]  = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId]   = useState<string | null>(null)
  
  const { data: customers, isLoading } = useCustomers({
    riskTag: riskTag === 'ALL' ? undefined : riskTag,
    search:  search || undefined,
  })
  
  const createCustomer = useCreateCustomer()
  const updateCustomer = useUpdateCustomer()
  const deleteCustomer = useDeleteCustomer()
  const bulkDelete     = useBulkDeleteCustomers()
  const sendReminders  = useSendReminders()

  const [form, setForm] = useState({ name: '', phone: '', address: '', creditLimit: 0, riskTag: 'RELIABLE' })
  const [formError, setFormError] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const list = customers ?? []
  const allSelected = list.length > 0 && selected.size === list.length

  function toggleOne(id: string) {
    setSelected(prev => {
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

  function handleDelete(id: string, name: string) {
    if (!confirm(`Delete customer "${name}"? This will deactivate the customer.`)) return
    deleteCustomer.mutate(id, { onSuccess: () => setSelected(prev => { const n = new Set(prev); n.delete(id); return n }) })
  }

  function handleBulkDelete() {
    if (!confirm(`Delete ${selected.size} selected customer(s)? They will be deactivated.`)) return
    bulkDelete.mutate([...selected], { onSuccess: () => setSelected(new Set()) })
  }

  function handleBulkRemind() {
    if (!confirm(`Send automated WhatsApp reminders to ${selected.size} selected customer(s)?`)) return
    sendReminders.mutate([...selected], { onSuccess: (res) => {
      alert(`Successfully sent ${res.data.sent} reminders.`)
      setSelected(new Set())
    }})
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setFormError('')
    try {
      if (editId) {
        await updateCustomer.mutateAsync({ id: editId, ...form })
      } else {
        await createCustomer.mutateAsync(form)
      }
      setShowForm(false); setEditId(null); setForm({ name: '', phone: '', address: '', creditLimit: 0, riskTag: 'RELIABLE' })
    } catch (err: any) { setFormError(err.response?.data?.error ?? 'Failed') }
  }

  function handleEditClick(c: any) {
    setForm({ name: c.name, phone: c.phone, address: c.address ?? '', creditLimit: Number(c.creditLimit), riskTag: c.riskTag ?? 'RELIABLE' })
    setEditId(c.id)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleCancel() {
    setShowForm(false)
    setEditId(null)
    setForm({ name: '', phone: '', address: '', creditLimit: 0, riskTag: 'RELIABLE' })
  }

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-4 gap-3">
        <div className="flex gap-1">
          {RISK_TAGS.map(t => (
            <button key={t} onClick={() => { setRiskTag(t); setSelected(new Set()) }}
              className={`text-xs px-3 py-1.5 rounded-md transition-colors ${
                riskTag === t ? 'bg-blue-600 text-white'
                : 'bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-600 hover:bg-stone-50'}`}>
              {t}
            </button>
          ))}
        </div>
        <div className="flex gap-2 flex-1 max-w-xs">
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name…"
            className="flex-1 text-xs px-3 py-1.5 border border-stone-200 dark:border-stone-700 rounded-lg bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-1 focus:ring-blue-500" />
        </div>
        <button onClick={() => { setEditId(null); setForm({ name: '', phone: '', address: '', creditLimit: 0, riskTag: 'RELIABLE' }); setShowForm(true) }}
          className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium">
          + Add customer
        </button>
      </div>

      {showForm && (
        <Card className="mb-4">
          <div className="text-xs font-medium text-stone-500 uppercase tracking-wide mb-3">
            {editId ? 'Edit customer' : 'New customer'}
          </div>
          <form onSubmit={handleSubmit} className="grid grid-cols-4 gap-3 items-end">
            {[
              { label: 'Name *',          key: 'name',       type: 'text',   placeholder: 'Rajesh Builders' },
              { label: 'Phone *',         key: 'phone',      type: 'tel',    placeholder: '9876543210' },
              { label: 'Address',         key: 'address',    type: 'text',   placeholder: 'Sector 7, Hisar' },
              { label: 'Credit limit (₹)',key: 'creditLimit',type: 'number', placeholder: '100000' },
            ].map(f => (
              <div key={f.key}>
                <label className="block text-xs text-stone-500 mb-1">{f.label}</label>
                <input type={f.type} placeholder={f.placeholder}
                  value={(form as any)[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: f.type === 'number' ? Number(e.target.value) : e.target.value }))}
                  className="w-full text-xs px-2 py-1.5 border border-stone-200 dark:border-stone-700 rounded-lg bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  required={f.key === 'name' || f.key === 'phone'} />
              </div>
            ))}
            <div>
              <label className="block text-xs text-stone-500 mb-1">Risk Tag</label>
              <select value={form.riskTag} onChange={e => setForm(p => ({ ...p, riskTag: e.target.value }))}
                className="w-full text-xs px-2 py-1.5 border border-stone-200 dark:border-stone-700 rounded-lg bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-1 focus:ring-blue-500">
                <option value="RELIABLE">Reliable</option>
                <option value="WATCH">Watch</option>
                <option value="BLOCKED">Blocked</option>
              </select>
            </div>
            <div className="flex gap-2 col-span-4 mt-2">
              <button type="submit" disabled={createCustomer.isPending || updateCustomer.isPending}
                className="text-xs px-4 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {createCustomer.isPending || updateCustomer.isPending ? 'Saving…' : 'Save customer'}
              </button>
              <button type="button" onClick={handleCancel}
                className="text-xs px-3 py-1.5 border border-stone-200 rounded-lg hover:bg-stone-50">Cancel</button>
            </div>
            {formError && <div className="col-span-4 text-xs text-red-600">{formError}</div>}
          </form>
        </Card>
      )}

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="mb-3 flex items-center gap-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-lg px-4 py-2">
          <span className="text-xs font-medium text-blue-800 dark:text-blue-200 w-[max-content]">
            {selected.size} customer{selected.size > 1 ? 's' : ''} selected
          </span>
          <div className="flex bg-white dark:bg-stone-800 shadow-sm rounded-md overflow-hidden border border-stone-200 dark:border-stone-700">
            <button onClick={handleBulkRemind} disabled={sendReminders.isPending}
              className="text-xs px-3 py-1.5 text-stone-700 hover:bg-stone-50 dark:text-stone-300 dark:hover:bg-stone-700 border-r border-stone-200 dark:border-stone-700 font-medium transition-colors">
              {sendReminders.isPending ? 'Sending…' : 'Send Reminders'}
            </button>
            <button onClick={handleBulkDelete} disabled={bulkDelete.isPending}
              className="text-xs px-3 py-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 font-medium transition-colors">
              {bulkDelete.isPending ? 'Deleting…' : `Delete`}
            </button>
          </div>
          <button onClick={() => setSelected(new Set())}
            className="text-xs text-stone-500 hover:text-stone-700 dark:text-stone-400 ml-auto">
            Clear selection
          </button>
        </div>
      )}

      <Card>
        {isLoading ? <PageLoader /> : list.length === 0 ? (
          <EmptyState title="No customers found" sub="Add your first customer to get started" />
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-stone-100 dark:border-stone-800">
                <th className="text-left py-2 pr-2 w-8">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll}
                    className="rounded border-stone-300 text-blue-600 focus:ring-blue-500 cursor-pointer" />
                </th>
                {['Name','Phone','Address','Credit limit','Outstanding','Orders','Risk',''].map(h => (
                  <th key={h} className="text-left py-2 pr-3 font-normal text-stone-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((c: any) => {
                const isSelected = selected.has(c.id)
                return (
                  <tr key={c.id} className={`border-b border-stone-50 dark:border-stone-800 last:border-0 transition-colors ${
                    isSelected ? 'bg-blue-50 dark:bg-blue-950/50' : 'hover:bg-stone-50 dark:hover:bg-stone-800/50'
                  }`}>
                    <td className="py-2.5 pr-2">
                      <input type="checkbox" checked={isSelected} onChange={() => toggleOne(c.id)}
                        className="rounded border-stone-300 text-blue-600 focus:ring-blue-500 cursor-pointer" />
                    </td>
                    <td className="py-2.5 pr-3 font-medium text-stone-800 dark:text-stone-200">{c.name}</td>
                    <td className="py-2.5 pr-3 text-stone-500">{c.phone}</td>
                    <td className="py-2.5 pr-3 text-stone-500 max-w-32 truncate">{c.address ?? '—'}</td>
                    <td className="py-2.5 pr-3">{fmt(Number(c.creditLimit))}</td>
                    <td className={`py-2.5 pr-3 font-medium ${c.balance > 0 ? 'text-red-600 dark:text-red-400' : 'text-stone-400'}`}>
                      {c.balance > 0 ? fmt(c.balance) : '—'}
                    </td>
                    <td className="py-2.5 pr-3 text-stone-500">{c.orderCount}</td>
                    <td className="py-2.5 pr-3"><Badge variant={statusBadge(c.riskTag)}>{c.riskTag}</Badge></td>
                    <td className="py-2.5">
                      <div className="flex gap-2">
                        <Link href={`/khata?customer=${c.id}`} className="text-blue-500 hover:underline">Khata</Link>
                        <button onClick={() => handleEditClick(c)}
                          className="text-stone-500 hover:text-stone-700 transition-colors">Edit</button>
                        <button onClick={() => handleDelete(c.id, c.name)}
                          className="text-red-400 hover:text-red-600 transition-colors">Delete</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Card>
    </AppShell>
  )
}
