'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useSupportNotifications, useSupportUnreadCount } from '@/lib/support'

function fmtTime(value: string) {
  const date = new Date(value)
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function NotificationBell({ isSuperAdmin }: { isSuperAdmin?: boolean }) {
  const [open, setOpen] = useState(false)
  const qc = useQueryClient()
  const unread = useSupportUnreadCount(true)
  const notifications = useSupportNotifications(open)
  const unreadCount = unread.data ?? 0

  const markAllRead = useMutation({
    mutationFn: () => api.post('/api/support/notifications/read-all', {}).then((res) => res.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['support', 'notifications', 'unread-count'] })
      qc.invalidateQueries({ queryKey: ['support', 'notifications'] })
    },
  })
  const markOneRead = useMutation({
    mutationFn: (notificationId: string) => api.post(`/api/support/notifications/${notificationId}/read`, {}).then((res) => res.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['support', 'notifications', 'unread-count'] })
      qc.invalidateQueries({ queryKey: ['support', 'notifications'] })
    },
  })

  const items = useMemo(() => notifications.data ?? [], [notifications.data])
  const ticketBase = isSuperAdmin ? '/super-admin/tickets' : '/tickets'

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        aria-label="Notifications"
      >
        <span className="text-base">🔔</span>
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="absolute right-0 z-40 mt-2 w-[320px] rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_20px_40px_rgba(15,23,42,0.16)] dark:border-slate-700 dark:bg-slate-950">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Notifications</div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => markAllRead.mutate()}
                className="text-xs font-semibold text-sky-700 hover:underline dark:text-sky-300"
              >
                Mark all read
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 text-xs font-semibold text-slate-600 dark:border-slate-600 dark:text-slate-300"
                aria-label="Close notifications"
              >
                x
              </button>
            </div>
          </div>
          <div className="max-h-80 space-y-2 overflow-auto pr-1">
            {items.length === 0 ? <div className="text-xs text-slate-500 dark:text-slate-400">No new notifications.</div> : null}
            {items.map((item) => (
              <Link
                key={item.id}
                href={`${ticketBase}?ticketId=${item.ticketId}`}
                onClick={() => {
                  setOpen(false)
                  if (!item.isRead) markOneRead.mutate(item.id)
                }}
                className={`block rounded-xl border p-2.5 text-xs transition ${
                  item.isRead
                    ? 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300'
                    : 'border-sky-200 bg-sky-50 text-slate-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-slate-100'
                }`}
              >
                <div className="font-semibold">{item.title}</div>
                <div className="mt-1 line-clamp-2">{item.body}</div>
                <div className="mt-1.5 text-[10px] text-slate-500 dark:text-slate-400">{fmtTime(item.createdAt)}</div>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
