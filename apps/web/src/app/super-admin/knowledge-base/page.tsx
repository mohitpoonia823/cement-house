'use client'
import { useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { SuperAdminShell } from '@/components/layout/SuperAdminShell'
import { Card, SectionHeader } from '@/components/ui/Card'
import { api } from '@/lib/api'
import { NumberInput } from '@/components/ui/NumberInput'

type AlertTone = 'success' | 'danger'

interface KbEntry {
  id: string
  title: string
  content: string
  category: string | null
  isPublished: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

type DraftState = {
  title: string
  content: string
  category: string
  isPublished: boolean
  sortOrder: number
}

const emptyDraft: DraftState = { title: '', content: '', category: '', isPublished: true, sortOrder: 0 }

export default function SuperAdminKnowledgeBasePage() {
  const qc = useQueryClient()
  const [alert, setAlert] = useState<{ tone: AlertTone; message: string } | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<DraftState>(emptyDraft)

  const entriesQuery = useQuery({
    queryKey: ['super-admin', 'knowledge-base'],
    queryFn: () => api.get('/api/super-admin/knowledge-base').then((res) => res.data.data as KbEntry[]),
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['super-admin', 'knowledge-base'] })

  function toPayload(d: DraftState) {
    return {
      title: d.title.trim(),
      content: d.content.trim(),
      category: d.category.trim() ? d.category.trim() : null,
      isPublished: d.isPublished,
      sortOrder: Number.isFinite(d.sortOrder) ? d.sortOrder : 0,
    }
  }

  const createEntry = useMutation({
    mutationFn: (payload: ReturnType<typeof toPayload>) => api.post('/api/super-admin/knowledge-base', payload).then((r) => r.data.data),
    onSuccess: () => {
      setDraft(emptyDraft)
      setEditingId(null)
      invalidate()
      setAlert({ tone: 'success', message: 'FAQ entry added.' })
    },
    onError: (e: any) => setAlert({ tone: 'danger', message: e?.response?.data?.error ?? 'Failed to add entry.' }),
  })

  const updateEntry = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<ReturnType<typeof toPayload>> }) =>
      api.patch(`/api/super-admin/knowledge-base/${id}`, payload).then((r) => r.data.data),
    onSuccess: () => {
      setDraft(emptyDraft)
      setEditingId(null)
      invalidate()
      setAlert({ tone: 'success', message: 'FAQ entry saved.' })
    },
    onError: (e: any) => setAlert({ tone: 'danger', message: e?.response?.data?.error ?? 'Failed to save entry.' }),
  })

  const deleteEntry = useMutation({
    mutationFn: (id: string) => api.delete(`/api/super-admin/knowledge-base/${id}`).then((r) => r.data),
    onSuccess: () => {
      invalidate()
      setAlert({ tone: 'success', message: 'FAQ entry deleted.' })
    },
    onError: (e: any) => setAlert({ tone: 'danger', message: e?.response?.data?.error ?? 'Failed to delete entry.' }),
  })

  const seedStarter = useMutation({
    mutationFn: () => api.post('/api/super-admin/knowledge-base/seed', {}).then((r) => r.data.data as { inserted: number }),
    onSuccess: (data) => {
      invalidate()
      setAlert({
        tone: 'success',
        message: data.inserted > 0 ? `Added ${data.inserted} starter entries. Review and edit them below.` : 'Starter entries already present — nothing to add.',
      })
    },
    onError: (e: any) => setAlert({ tone: 'danger', message: e?.response?.data?.error ?? 'Failed to generate starter entries.' }),
  })

  const togglePublish = (entry: KbEntry) =>
    updateEntry.mutate({ id: entry.id, payload: { isPublished: !entry.isPublished } })

  function startEdit(entry: KbEntry) {
    setEditingId(entry.id)
    setDraft({
      title: entry.title,
      content: entry.content,
      category: entry.category ?? '',
      isPublished: entry.isPublished,
      sortOrder: entry.sortOrder,
    })
    setAlert(null)
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelEdit() {
    setEditingId(null)
    setDraft(emptyDraft)
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setAlert(null)
    const payload = toPayload(draft)
    if (payload.title.length < 2 || payload.content.length < 2) {
      setAlert({ tone: 'danger', message: 'Title and content are required.' })
      return
    }
    if (editingId) updateEntry.mutate({ id: editingId, payload })
    else createEntry.mutate(payload)
  }

  const entries = entriesQuery.data ?? []
  const saving = createEntry.isPending || updateEntry.isPending

  return (
    <SuperAdminShell>
      <SectionHeader
        eyebrow="Support assistant"
        title="Knowledge Base"
        description="FAQ entries that ground the in-app AI assistant. Published entries are used to answer users. If none are published, the app uses its built-in default knowledge."
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

      <div className="grid gap-5 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <Card>
          <div className="mb-4 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {editingId ? 'Edit entry' : 'Add entry'}
          </div>
          <form onSubmit={submit} className="space-y-3">
            <Field label="Title">
              <input value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} className={inputCls} placeholder="How do I record a payment?" required />
            </Field>
            <Field label="Category (optional)">
              <input value={draft.category} onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))} className={inputCls} placeholder="Payments / Orders / Billing…" />
            </Field>
            <Field label="Answer / content">
              <textarea
                value={draft.content}
                onChange={(e) => setDraft((d) => ({ ...d, content: e.target.value }))}
                className={`${inputCls} min-h-[160px]`}
                placeholder="Explain the steps clearly. The AI will phrase this for the user."
                required
              />
            </Field>
            <div className="flex items-center gap-4">
              <Field label="Sort order">
                <NumberInput value={draft.sortOrder}
                  onChange={(e) => setDraft((d) => ({ ...d, sortOrder: Number(e.target.value) }))}
                  className={`${inputCls} w-28`}
                  min={0} />
              </Field>
              <label className="mt-5 inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                <input type="checkbox" checked={draft.isPublished} onChange={(e) => setDraft((d) => ({ ...d, isPublished: e.target.checked }))} className="h-4 w-4" />
                Published
              </label>
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={saving} className={saveBtnCls}>
                {saving ? 'Saving…' : editingId ? 'Save changes' : 'Add entry'}
              </button>
              {editingId ? (
                <button type="button" onClick={cancelEdit} className={cancelBtnCls}>
                  Cancel
                </button>
              ) : null}
            </div>
          </form>
        </Card>

        <Card>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Entries ({entries.length})</div>
            {entries.length > 0 ? (
              <button type="button" onClick={() => seedStarter.mutate()} disabled={seedStarter.isPending} className={smallBtnCls}>
                {seedStarter.isPending ? 'Generating…' : 'Add starter entries'}
              </button>
            ) : null}
          </div>
          {entriesQuery.isLoading ? (
            <div className="text-sm text-slate-500 dark:text-slate-400">Loading…</div>
          ) : entries.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300">
              <div className="font-medium text-slate-800 dark:text-slate-200">No entries yet.</div>
              <p className="mt-1 text-slate-500 dark:text-slate-400">
                The assistant already works using the built-in default knowledge. To customize its answers, generate a ready-made starter set from the app&apos;s features — then just review and edit.
              </p>
              <button
                type="button"
                onClick={() => seedStarter.mutate()}
                disabled={seedStarter.isPending}
                className="mt-4 inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-sky-500 to-violet-500 px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
              >
                {seedStarter.isPending ? 'Generating…' : 'Generate starter knowledge base'}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {entries.map((entry) => (
                <div key={entry.id} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{entry.title}</span>
                        {entry.category ? (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">{entry.category}</span>
                        ) : null}
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            entry.isPublished
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200'
                              : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {entry.isPublished ? 'Published' : 'Draft'}
                        </span>
                      </div>
                      <div className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{entry.content}</div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={() => startEdit(entry)} className={smallBtnCls}>
                      Edit
                    </button>
                    <button type="button" onClick={() => togglePublish(entry)} className={smallBtnCls}>
                      {entry.isPublished ? 'Unpublish' : 'Publish'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (typeof window !== 'undefined' && window.confirm('Delete this FAQ entry?')) deleteEntry.mutate(entry.id)
                      }}
                      className="rounded-full border border-rose-300 px-3 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:border-rose-500/40 dark:text-rose-300 dark:hover:bg-rose-950/30"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
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
  'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100'
const saveBtnCls =
  'rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60 dark:bg-indigo-500 dark:text-slate-950 dark:hover:bg-indigo-400'
const cancelBtnCls =
  'rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300'
const smallBtnCls =
  'rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800'
