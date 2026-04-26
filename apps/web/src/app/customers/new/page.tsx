'use client'
import { AppShell }       from '@/components/layout/AppShell'
import { Card }           from '@/components/ui/Card'
import { useCreateCustomer } from '@/hooks/useCustomers'
import { useRouter }      from 'next/navigation'
import { useState }       from 'react'

export default function NewCustomerPage() {
  const router = useRouter()
  const createCustomer = useCreateCustomer()
  const [form, setForm] = useState({
    name: '', phone: '', altPhone: '', address: '',
    siteAddress: '', gstin: '', creditLimit: 50000, notes: '',
  })
  const [error, setError] = useState('')

  function set(key: string, value: any) {
    setForm(p => ({ ...p, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError('')
    try {
      await createCustomer.mutateAsync({ ...form, creditLimit: Number(form.creditLimit) })
      router.push('/customers')
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Failed to create customer')
    }
  }

  return (
    <AppShell>
      <form onSubmit={handleSubmit} className="max-w-xl space-y-4">
        <Card>
          <div className="text-xs font-medium text-stone-500 uppercase tracking-wide mb-4">Customer details</div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {[
              { label: 'Full name *',       key: 'name',        type: 'text',   placeholder: 'Rajesh Builders',   full: true  },
              { label: 'Phone *',           key: 'phone',       type: 'tel',    placeholder: '9876543210'                     },
              { label: 'Alternate phone',   key: 'altPhone',    type: 'tel',    placeholder: 'Optional'                       },
              { label: 'GST number',        key: 'gstin',       type: 'text',   placeholder: 'Optional'                       },
              { label: 'Office / address',  key: 'address',     type: 'text',   placeholder: 'Sector 7, Hisar',   full: true  },
              { label: 'Site / delivery address', key: 'siteAddress', type: 'text', placeholder: 'If different', full: true   },
              { label: 'Credit limit (₹)',  key: 'creditLimit', type: 'number', placeholder: '50000'                          },
            ].map(f => (
              <div key={f.key} className={f.full ? 'md:col-span-2' : ''}>
                <label className="block text-xs text-stone-500 mb-1">{f.label}</label>
                <input
                  type={f.type}
                  placeholder={f.placeholder}
                  value={(form as any)[f.key]}
                  onChange={e => set(f.key, e.target.value)}
                  required={f.key === 'name' || f.key === 'phone'}
                  className="w-full text-sm px-3 py-2 border border-stone-200 dark:border-stone-700 rounded-lg bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            ))}
            <div className="md:col-span-2">
              <label className="block text-xs text-stone-500 mb-1">Notes</label>
              <textarea
                placeholder="Any special notes about this customer…"
                value={form.notes}
                onChange={e => set('notes', e.target.value)}
                rows={3}
                className="w-full text-sm px-3 py-2 border border-stone-200 dark:border-stone-700 rounded-lg bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>
          </div>
        </Card>

        {error && (
          <div className="text-xs text-red-600 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <button type="submit" disabled={createCustomer.isPending}
            className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {createCustomer.isPending ? 'Saving…' : 'Save customer'}
          </button>
          <button type="button" onClick={() => router.back()}
            className="px-5 py-2 border border-stone-200 dark:border-stone-700 text-sm rounded-lg hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors">
            Cancel
          </button>
        </div>
      </form>
    </AppShell>
  )
}
