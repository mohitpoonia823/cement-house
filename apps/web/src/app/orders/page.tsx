'use client'
import { AppShell } from '@/components/layout/AppShell'
import { Card, MetricCard, MetricGrid, SectionHeader } from '@/components/ui/Card'
import { Badge, statusBadge } from '@/components/ui/Badge'
import { PageLoader } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { useOrders, useDeleteOrder, useBulkDeleteOrders, useUpdateOrderStatus } from '@/hooks/useOrders'
import { fmt, fmtDate } from '@/lib/utils'
import { useI18n } from '@/lib/i18n'
import { useAuthStore } from '@/store/auth'
import { businessTerms } from '@/lib/business-terms'
import Link from 'next/link'
import { Suspense, useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter, useSearchParams } from 'next/navigation'

const STATUSES = ['ALL', 'CONFIRMED', 'DISPATCHED', 'DELIVERED', 'CANCELLED'] as const
const NewOrderForm = dynamic(
  () => import('@/components/orders/NewOrderForm').then((mod) => mod.NewOrderForm),
  {
    ssr: false,
    loading: () => <PageLoader />,
  }
)

export default function OrdersPage() {
  return (
    <Suspense fallback={<AppShell><PageLoader /></AppShell>}>
      <OrdersContent />
    </Suspense>
  )
}

function OrdersContent() {
  const { user } = useAuthStore()
  const { language } = useI18n()
  const t = (en: string, hi: string, hinglish?: string) => (language === 'hi' ? hi : language === 'hinglish' ? (hinglish ?? en) : en)
  const terms = businessTerms(user?.businessType as any, user?.customLabels as any)

  const tr = {
    eyebrow: t('Order analytics', 'ऑर्डर विश्लेषण'),
    title: t('Order operations', 'ऑर्डर संचालन'),
    desc: t(
      'Track pipeline health, outstanding exposure, and dispatch-ready business from one working board.',
      'एक ही बोर्ड से पाइपलाइन, बकाया और डिस्पैच तैयार ऑर्डर ट्रैक करें।',
      'Pipeline, outstanding aur dispatch-ready orders ek board se track karo.'
    ),
    newOrder: t('+ New order', '+ नया ऑर्डर', '+ Naya order'),
    clearSelection: t('Clear selection', 'चयन हटाएँ', 'Selection clear karo'),
    deleteSelected: t('Delete selected', 'चयनित हटाएँ', 'Selected delete karo'),
    deleting: t('Deleting...', 'हटाया जा रहा है...', 'Delete ho raha hai...'),
    noOrders: t('No orders found', 'कोई ऑर्डर नहीं मिला', 'Koi order nahi mila'),
    createFirst: t('Create your first order to get started', 'शुरू करने के लिए पहला ऑर्डर बनाएं', 'Start karne ke liye pehla order banao'),
    createOrder: t('Create order', 'ऑर्डर बनाएं', 'Order banao'),
    view: t('View', 'देखें'),
    del: t('Delete', 'हटाएँ'),
    close: t('Close', 'बंद करें', 'Band karo'),
    modalTitle: t('New order', 'नया ऑर्डर', 'Naya order'),
    visibleOrders: t('Visible orders', 'दिख रहे ऑर्डर'),
    totalInResult: t('total in current result', 'वर्तमान परिणाम में कुल'),
    bookedValue: t('Booked value', 'बुक्ड वैल्यू'),
    currentFilterSelection: t('Current filter selection', 'वर्तमान फ़िल्टर चयन'),
    collected: t('Collected', 'प्राप्त राशि'),
    paymentsReceived: t('Payments received against these orders', 'इन ऑर्डर्स के विरुद्ध प्राप्त भुगतान'),
    outstanding: t('Outstanding', 'बकाया'),
    remainingDue: t('Remaining due balance', 'बाकी देय राशि'),
    selectedSuffix: t('selected', 'चयनित', 'selected'),
    orderDeleted: t('Order deleted successfully', 'ऑर्डर सफलतापूर्वक हटाया गया।'),
    deleteFailed: t('Failed to delete order', 'ऑर्डर हटाने में समस्या हुई।'),
    deleteSelectedFailed: t('Failed to delete selected orders', 'चयनित ऑर्डर हटाने में समस्या हुई।'),
    orderCreated: t('Order created successfully', 'ऑर्डर सफलतापूर्वक बनाया गया।'),
    totalOrdersSuffix: t('total orders', 'कुल ऑर्डर'),
    deleteHint: t('This will reverse stock and remove ledger entries.', 'इससे स्टॉक वापस होगा और लेजर एंट्री हटेगी।'),
    deleteSelectedHint: t('Stock will be reversed and ledger entries removed.', 'स्टॉक वापस होगा और लेजर एंट्री हटेगी।'),
    columns: {
      orderNo: t('Order #', 'ऑर्डर #'),
      orderDate: t('Order Date', 'ऑर्डर तिथि'),
      deliveryDate: t('Delivery Date', 'डिलीवरी तिथि'),
      customer: language === 'hi' ? 'ग्राहक' : terms.customer,
      items: language === 'hi' ? 'आइटम' : `${terms.material}s`,
      amount: t('Amount', 'राशि'),
      paid: t('Paid', 'भुगतान'),
      due: t('Due', 'बकाया'),
      status: t('Status', 'स्थिति'),
      actions: t('Actions', 'क्रियाएं'),
    },
  }

  const statusLabels = useMemo(
    () => ({
      ALL: t('ALL', 'सभी'),
      CONFIRMED: t('CONFIRMED', 'कन्फर्म'),
      DISPATCHED: t('DISPATCHED', 'डिस्पैच'),
      DELIVERED: t('DELIVERED', 'डिलीवर'),
      CANCELLED: t('CANCELLED', 'रद्द'),
    }),
    [language]
  )

  const router = useRouter()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<(typeof STATUSES)[number]>('ALL')
  const [showNewOrderModal, setShowNewOrderModal] = useState(false)
  const { data, isLoading } = useOrders({ status: status === 'ALL' ? undefined : status } as any)
  const deleteOrder = useDeleteOrder()
  const bulkDelete = useBulkDeleteOrders()
  const updateStatus = useUpdateOrderStatus()
  const orders = data?.items ?? []

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [alert, setAlert] = useState<{ tone: 'success' | 'danger'; message: string } | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<{
    open: boolean
    mode: 'single' | 'bulk'
    id?: string
    orderNumber?: string
    ids?: string[]
  }>({ open: false, mode: 'single' })
  const [cancelConfirm, setCancelConfirm] = useState<{ open: boolean; id?: string; orderNumber?: string }>({ open: false })
  const allSelected = orders.length > 0 && selected.size === orders.length
  const selectedOrders = useMemo(() => orders.filter((o: any) => selected.has(o.id)), [orders, selected])

  useEffect(() => {
    const message = sessionStorage.getItem('orders_success_message')
    if (message) {
      setAlert({ tone: 'success', message })
      sessionStorage.removeItem('orders_success_message')
    }
  }, [])

  useEffect(() => {
    if (searchParams.get('openNewOrder') === '1') {
      setShowNewOrderModal(true)
      router.replace('/orders')
    }
  }, [router, searchParams])

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
      setSelected(new Set(orders.map((o: any) => o.id)))
    }
  }

  function handleDelete(id: string, orderNumber: string, status: string) {
    setDeleteConfirm({ open: true, mode: 'single', id, orderNumber })
  }

  function handleBulkDelete() {
    if (selected.size === 0) return
    setDeleteConfirm({ open: true, mode: 'bulk', ids: [...selected] })
  }

  function closeDeleteConfirm() {
    if (deleteOrder.isPending || bulkDelete.isPending) return
    setDeleteConfirm({ open: false, mode: 'single' })
  }

  function confirmDelete() {
    if (deleteConfirm.mode === 'single' && deleteConfirm.id) {
      const id = deleteConfirm.id
      deleteOrder.mutate(id, {
        onSuccess: () => {
          setSelected((prev) => {
            const n = new Set(prev)
            n.delete(id)
            return n
          })
          setAlert({ tone: 'success', message: tr.orderDeleted })
          setDeleteConfirm({ open: false, mode: 'single' })
        },
        onError: (error: any) => {
          setAlert({ tone: 'danger', message: error?.response?.data?.error ?? tr.deleteFailed })
          setDeleteConfirm({ open: false, mode: 'single' })
        },
      })
      return
    }

    if (deleteConfirm.mode === 'bulk' && deleteConfirm.ids && deleteConfirm.ids.length > 0) {
      bulkDelete.mutate(deleteConfirm.ids, {
        onSuccess: () => {
          setSelected(new Set())
          setAlert({ tone: 'success', message: tr.orderDeleted })
          setDeleteConfirm({ open: false, mode: 'single' })
        },
        onError: (error: any) => {
          setAlert({ tone: 'danger', message: error?.response?.data?.error ?? tr.deleteSelectedFailed })
          setDeleteConfirm({ open: false, mode: 'single' })
        },
      })
    }
  }

  function openCancelConfirm(id: string, orderNumber: string) {
    setCancelConfirm({ open: true, id, orderNumber })
  }

  function closeCancelConfirm() {
    if (updateStatus.isPending) return
    setCancelConfirm({ open: false })
  }

  function confirmCancelOrder() {
    if (!cancelConfirm.id) return
    updateStatus.mutate(
      { id: cancelConfirm.id, status: 'CANCELLED' },
      {
        onSuccess: () => {
          setAlert({ tone: 'success', message: t('Order cancelled successfully', 'ऑर्डर सफलतापूर्वक रद्द किया गया।', 'Order successfully cancel ho gaya.') })
          setCancelConfirm({ open: false })
        },
        onError: (error: any) => {
          setAlert({ tone: 'danger', message: error?.response?.data?.error ?? t('Failed to cancel order', 'ऑर्डर रद्द करने में समस्या हुई।', 'Order cancel karne me problem hui.') })
          setCancelConfirm({ open: false })
        },
      }
    )
  }

  return (
    <AppShell>
      <SectionHeader
        eyebrow={tr.eyebrow}
        title={tr.title}
        description={tr.desc}
        action={
          <>
            <Link
              href="/orders/new"
              className="hidden rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-sky-500 dark:text-slate-950 xl:inline-flex"
            >
              {tr.newOrder}
            </Link>
            <button
              type="button"
              onClick={() => setShowNewOrderModal(true)}
              className="rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-sky-500 dark:text-slate-950 xl:hidden"
            >
              {tr.newOrder}
            </button>
          </>
        }
      />

      <MetricGrid className="mb-6">
        <MetricCard label={tr.visibleOrders} value={String(orders.length)} hint={`${data?.total ?? 0} ${tr.totalInResult}`} />
        <MetricCard
          label={tr.bookedValue}
          value={fmt(orders.reduce((sum: number, o: any) => sum + Number(o.totalAmount), 0))}
          hint={tr.currentFilterSelection}
          tone="brand"
        />
        <MetricCard
          label={tr.collected}
          value={fmt(orders.reduce((sum: number, o: any) => sum + Number(o.amountPaid), 0))}
          hint={tr.paymentsReceived}
          tone="success"
        />
        <MetricCard
          label={tr.outstanding}
          value={fmt(orders.reduce((sum: number, o: any) => sum + (Number(o.totalAmount) - Number(o.amountPaid)), 0))}
          hint={tr.remainingDue}
          tone="warning"
        />
      </MetricGrid>

      {alert ? (
        <div
          className={`mb-4 rounded-lg border px-4 py-2 text-sm ${alert.tone === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-950/30 dark:text-emerald-200'
              : 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-950/30 dark:text-rose-200'
            }`}
        >
          <div className="flex items-center justify-between gap-3">
            <span>{alert.message}</span>
            <button
              type="button"
              onClick={() => setAlert(null)}
              className="rounded px-2 py-0.5 text-xs font-semibold opacity-80 hover:opacity-100"
              aria-label={t('Dismiss alert', 'अलर्ट बंद करें', 'Alert band karo')}
            >
              ×
            </button>
          </div>
        </div>
      ) : null}

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => {
                setStatus(s)
                setSelected(new Set())
              }}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition-colors ${status === s
                  ? 'bg-slate-950 text-white dark:bg-sky-500 dark:text-slate-950'
                  : 'border border-slate-200 bg-white/75 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300'
                }`}
            >
              {statusLabels[s]}
            </button>
          ))}
        </div>
      </div>

      {selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2 dark:border-red-800 dark:bg-red-950">
          <span className="text-xs font-medium text-red-800 dark:text-red-200">
            {selected.size} {language === 'hi' ? `ऑर्डर ${tr.selectedSuffix}` : language === 'hinglish' ? 'order selected' : `order${selected.size > 1 ? 's' : ''} selected`}
          </span>
          <button
            onClick={handleBulkDelete}
            disabled={bulkDelete.isPending}
            className="rounded-md bg-red-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
          >
            {bulkDelete.isPending ? tr.deleting : tr.deleteSelected}
          </button>
          <button onClick={() => setSelected(new Set())} className="ml-0 text-xs text-stone-500 hover:text-stone-700 dark:text-stone-400 md:ml-auto">
            {tr.clearSelection}
          </button>
        </div>
      )}

      <Card>
        {isLoading ? (
          <PageLoader />
        ) : orders.length === 0 ? (
          <EmptyState
            title={tr.noOrders}
            sub={tr.createFirst}
            action={
              <>
                <Link href="/orders/new" className="hidden text-xs text-blue-600 hover:underline xl:inline-flex">
                  {tr.createOrder}
                </Link>
                <button type="button" onClick={() => setShowNewOrderModal(true)} className="text-xs text-blue-600 hover:underline xl:hidden">
                  {tr.createOrder}
                </button>
              </>
            }
          />
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
                  {[tr.columns.orderNo, tr.columns.orderDate, tr.columns.deliveryDate, tr.columns.customer, tr.columns.items, tr.columns.amount, tr.columns.paid, tr.columns.due, tr.columns.status, tr.columns.actions].map((h) => (
                    <th key={h} className="py-3 pr-3 text-left font-normal uppercase tracking-[0.18em] text-slate-400 dark:text-slate-300">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.map((o: any) => {
                  const due = Number(o.totalAmount) - Number(o.amountPaid)
                  const isSelected = selected.has(o.id)
                  return (
                    <tr
                      key={o.id}
                      onClick={() => router.push(`/orders/${o.id}`)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          router.push(`/orders/${o.id}`)
                        }
                      }}
                      className={`last:border-0 border-b border-stone-50 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:border-stone-800 ${isSelected ? 'bg-sky-50 dark:bg-sky-900/40' : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/70'
                        }`}
                    >
                      <td className="py-2.5 pr-2">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleOne(o.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="cursor-pointer rounded border-stone-300 text-blue-600 focus:ring-blue-500"
                        />
                      </td>
                      <td className="py-2.5 pr-3 font-medium text-stone-700 dark:text-stone-300">{o.orderNumber}</td>
                      <td className="py-2.5 pr-3 text-stone-500 dark:text-slate-300">{fmtDate(o.orderDate ?? o.createdAt)}</td>
                      <td className="py-2.5 pr-3 text-stone-500 dark:text-slate-300">{o.deliveryDate ? fmtDate(o.deliveryDate) : '-'}</td>
                      <td className="py-2.5 pr-3 font-medium text-stone-800 dark:text-stone-200">{o.customer?.name}</td>
                      <td className="py-2.5 pr-3 text-stone-500 dark:text-slate-300">{o.items?.length}</td>
                      <td className="py-2.5 pr-3 font-medium">{fmt(Number(o.totalAmount))}</td>
                      <td className="py-2.5 pr-3 text-green-700 dark:text-green-400">{fmt(Number(o.amountPaid))}</td>
                      <td className={`py-2.5 pr-3 font-medium ${due > 0 ? 'text-red-600 dark:text-red-400' : 'text-stone-400'}`}>
                        {due > 0 ? fmt(due) : '-'}
                      </td>
                      <td className="py-2.5 pr-3">
                        <Badge variant={statusBadge(o.status)}>{statusLabels[o.status as keyof typeof statusLabels] ?? o.status}</Badge>
                      </td>
                      <td className="py-2.5">
                        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => router.push(`/orders/${o.id}`)}
                            title={t('Open order', 'ऑर्डर खोलें', 'Order kholo')}
                            aria-label={t('Open order', 'ऑर्डर खोलें', 'Order kholo')}
                            className="rounded-md p-1.5 text-sky-600 transition-colors hover:bg-sky-50 hover:text-sky-700 dark:text-sky-400 dark:hover:bg-sky-950/40"
                          >
                            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M12 20h9" />
                              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(o.id, o.orderNumber, o.status)}
                            title={t('Delete order', 'ऑर्डर हटाएं', 'Order delete karo')}
                            aria-label={t('Delete order', 'ऑर्डर हटाएं', 'Order delete karo')}
                            className="rounded-md p-1.5 text-rose-500 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:text-rose-400 dark:hover:bg-rose-950/40"
                          >
                            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M3 6h18" />
                              <path d="M8 6V4h8v2" />
                              <path d="M19 6l-1 14H6L5 6" />
                              <path d="M10 11v6M14 11v6" />
                            </svg>
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

      {deleteConfirm.open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-3">
              <div className="text-lg font-semibold text-slate-950 dark:text-slate-100">
                {t('????? ?? ?????? ????', '????? ?? ?????? ????', 'Delete confirm karo')}
              </div>
              <button
                type="button"
                onClick={closeDeleteConfirm}
                disabled={deleteOrder.isPending || bulkDelete.isPending}
                className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                aria-label={t('Close', 'Close', 'Close')}
              >
                &times;
              </button>
            </div>
            <div className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              {(() => {
                if (deleteConfirm.mode === 'single') {
                  const target = orders.find((o: any) => o.id === deleteConfirm.id)
                  const deliveredWarning = target?.status === 'DELIVERED'
                    ? t('Delivered order: inventory will not be restored. If due is pending, khata entries stay linked to this soft-deleted order.', '?? ???????? ????? ??? ????????? ???? ???? ????? ????? ???? ?? ???? ?????? ???? ??????', 'Delivered order hai: inventory restore nahi hoga. Agar due pending hai to khata entries is soft-deleted order se linked rahengi.')
                    : t('Non-delivered order: inventory will be restored and related khata/ledger entries will be removed.', 'Non-delivered order: inventory will be restored and related khata/ledger entries will be removed.', 'Non-delivered order: inventory restore hoga aur related khata/ledger entries remove hongi.')
                  return `${tr.del} ${deleteConfirm.orderNumber}? ${deliveredWarning}`
                }

                const count = deleteConfirm.ids?.length ?? 0
                const deliveredCount = selectedOrders.filter((o: any) => o.status === 'DELIVERED').length
                if (count === 1 && selectedOrders[0]?.orderNumber) {
                  const deliveredWarning = selectedOrders[0].status === 'DELIVERED'
                    ? t('Delivered order: inventory will not be restored. If due is pending, khata entries stay linked to this soft-deleted order.', '?? ???????? ????? ??? ????????? ???? ???? ????? ????? ???? ?? ???? ?????? ???? ??????', 'Delivered order hai: inventory restore nahi hoga. Agar due pending hai to khata entries is soft-deleted order se linked rahengi.')
                    : t('Non-delivered order: inventory will be restored and related khata/ledger entries will be removed.', 'Non-delivered order: inventory will be restored and related khata/ledger entries will be removed.', 'Non-delivered order: inventory restore hoga aur related khata/ledger entries remove hongi.')
                  return `${tr.del} ${selectedOrders[0].orderNumber}? ${deliveredWarning}`
                }
                if (deliveredCount > 0) {
                  return t(
                    `Delete ${count} selected orders? Includes ${deliveredCount} delivered order(s): delivered inventory will not be restored and pending khata remains linked. Non-delivered inventory will be restored and related khata/ledger entries will be removed.`,
                    `${count} चयनित ऑर्डर हटाने हैं? इनमें ${deliveredCount} डिलीवर्ड ऑर्डर शामिल हैं; बिक्री, स्टॉक और लेजर प्रभाव हट जाएगा।`,
                    `${count} selected orders delete karne hain? ${deliveredCount} delivered orders included hain: delivered inventory restore nahi hoga aur pending khata linked rahega. Non-delivered inventory restore hoga aur related khata/ledger entries remove hongi.`
                  )
                }
                return `${tr.del} ${count}? ${t('Non-delivered order: inventory will be restored and related khata/ledger entries will be removed.', 'Non-delivered order: inventory will be restored and related khata/ledger entries will be removed.', 'Non-delivered order: inventory restore hoga aur related khata/ledger entries remove hongi.')}`
              })()}
            </div>
            <div className="mt-5 flex justify-end gap-2 select-none">
              <button
                type="button"
                onClick={closeDeleteConfirm}
                disabled={deleteOrder.isPending || bulkDelete.isPending}
                className="select-none rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                {t('Cancel', 'रद्द करें', 'Cancel')}
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleteOrder.isPending || bulkDelete.isPending}
                className="select-none rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 disabled:opacity-50"
              >
                {deleteOrder.isPending || bulkDelete.isPending ? tr.deleting : tr.del}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {cancelConfirm.open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-3">
              <div className="text-lg font-semibold text-slate-950 dark:text-slate-100">
                {t('???? ???? ?? ?????? ????', '???? ???? ?? ?????? ????', 'Cancel confirm karo')}
              </div>
              <button
                type="button"
                onClick={closeCancelConfirm}
                disabled={updateStatus.isPending}
                className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                aria-label={t('Close', 'Close', 'Close')}
              >
                &times;
              </button>
            </div>
            <div className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              {t(
                `Cancel ${cancelConfirm.orderNumber}? This will reverse stock and remove related ledger/order entries.`,
                `${cancelConfirm.orderNumber} को रद्द करना है? इससे स्टॉक रिवर्स होगा और संबंधित लेजर/ऑर्डर प्रभाव हटेगा।`,
                `${cancelConfirm.orderNumber} cancel karna hai? Isse stock reverse hoga aur related ledger/order impact remove hoga.`
              )}
            </div>
            <div className="mt-5 flex justify-end gap-2 select-none">
              <button
                type="button"
                onClick={closeCancelConfirm}
                disabled={updateStatus.isPending}
                className="select-none rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                {t('Keep order', 'ऑर्डर रखें', 'Order rakho')}
              </button>
              <button
                type="button"
                onClick={confirmCancelOrder}
                disabled={updateStatus.isPending}
                className="select-none rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 disabled:opacity-50"
              >
                {updateStatus.isPending ? t('Cancelling...', 'रद्द किया जा रहा है...', 'Cancel ho raha hai...') : t('Cancel order', 'ऑर्डर रद्द करें', 'Order cancel karo')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {data?.total > 0 && <div className="mt-3 text-right text-xs text-stone-400">{data.total} {tr.totalOrdersSuffix}</div>}

      {showNewOrderModal && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-950/45 p-3 xl:hidden" onClick={() => setShowNewOrderModal(false)}>
          <div className="max-h-[90vh] w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <div className="text-xs font-medium uppercase tracking-wide text-stone-500">{tr.modalTitle}</div>
              <button
                type="button"
                onClick={() => setShowNewOrderModal(false)}
                className="rounded-md border border-stone-200 px-2 py-1 text-xs text-stone-600 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
              >
                {tr.close}
              </button>
            </div>
            <NewOrderForm
              redirectOnSuccess={false}
              onSuccess={() => {
                setShowNewOrderModal(false)
                setAlert({ tone: 'success', message: tr.orderCreated })
              }}
              onCancel={() => setShowNewOrderModal(false)}
            />
          </div>
        </div>
      )}
    </AppShell>
  )
}

