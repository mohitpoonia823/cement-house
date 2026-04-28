'use client'

import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { type SupportTicket, useSupportTicket, useSupportTickets } from '@/lib/support'
import { useI18n } from '@/lib/i18n'

function fmtDateTime(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function statusChip(status: string) {
  return status === 'RESOLVED'
    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200'
    : 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200'
}

export function SupportTicketsBoard({
  isSuperAdmin,
  preselectedTicketId,
}: {
  isSuperAdmin?: boolean
  preselectedTicketId?: string | null
}) {
  const { language } = useI18n()
  const t = (en: string, hi: string, hinglish?: string) =>
    language === 'hi' ? hi : language === 'hinglish' ? (hinglish ?? en) : en
  const qc = useQueryClient()
  const ticketsQuery = useSupportTickets(true)
  const tickets = ticketsQuery.data ?? []
  const [selectedId, setSelectedId] = useState<string | null>(preselectedTicketId ?? null)
  const [subject, setSubject] = useState('')
  const [firstMessage, setFirstMessage] = useState('')
  const [messageInput, setMessageInput] = useState('')
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState('')

  useEffect(() => {
    if (preselectedTicketId) {
      setSelectedId(preselectedTicketId)
      return
    }
    if (!selectedId && tickets.length > 0) setSelectedId(tickets[0].id)
  }, [preselectedTicketId, selectedId, tickets])

  const selectedTicket = useMemo(
    () => tickets.find((ticket) => ticket.id === selectedId) ?? null,
    [selectedId, tickets]
  )
  const ticketDetail = useSupportTicket(selectedId, Boolean(selectedId))

  const createTicket = useMutation({
    mutationFn: (payload: { subject?: string; message: string }) =>
      api.post('/api/support/tickets', payload).then((res) => res.data.data as { ticketId: string }),
    onSuccess: (data) => {
      setSubject('')
      setFirstMessage('')
      qc.invalidateQueries({ queryKey: ['support', 'tickets'] })
      setSelectedId(data.ticketId)
    },
  })

  const sendMessage = useMutation({
    mutationFn: (payload: { ticketId: string; message: string }) =>
      api.post(`/api/support/tickets/${payload.ticketId}/messages`, { message: payload.message }).then((res) => res.data),
    onSuccess: () => {
      setMessageInput('')
      qc.invalidateQueries({ queryKey: ['support', 'tickets'] })
      if (selectedId) qc.invalidateQueries({ queryKey: ['support', 'ticket', selectedId] })
      qc.invalidateQueries({ queryKey: ['support', 'notifications'] })
      qc.invalidateQueries({ queryKey: ['support', 'notifications', 'unread-count'] })
    },
  })

  const editMessage = useMutation({
    mutationFn: (payload: { ticketId: string; messageId: string; message: string }) =>
      api.patch(`/api/support/tickets/${payload.ticketId}/messages/${payload.messageId}`, { message: payload.message }).then((res) => res.data),
    onSuccess: () => {
      setEditingMessageId(null)
      setEditingValue('')
      qc.invalidateQueries({ queryKey: ['support', 'tickets'] })
      if (selectedId) qc.invalidateQueries({ queryKey: ['support', 'ticket', selectedId] })
    },
  })

  const deleteMessage = useMutation({
    mutationFn: (payload: { ticketId: string; messageId: string }) =>
      api.delete(`/api/support/tickets/${payload.ticketId}/messages/${payload.messageId}`).then((res) => res.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['support', 'tickets'] })
      if (selectedId) qc.invalidateQueries({ queryKey: ['support', 'ticket', selectedId] })
    },
  })

  const updateStatus = useMutation({
    mutationFn: (payload: { ticketId: string; status: 'OPEN' | 'RESOLVED' }) =>
      api.patch(`/api/support/tickets/${payload.ticketId}/status`, { status: payload.status }).then((res) => res.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['support', 'tickets'] })
      if (selectedId) qc.invalidateQueries({ queryKey: ['support', 'ticket', selectedId] })
    },
  })

  const listTitle = isSuperAdmin ? t('All tickets', 'सभी टिकट', 'Saare tickets') : t('Your tickets', 'आपके टिकट', 'Aapke tickets')
  const emptyText = isSuperAdmin
    ? t('No tickets yet.', 'अभी कोई टिकट नहीं।', 'Abhi koi ticket nahi.')
    : t('No tickets yet. Use Need Help to create one.', 'अभी कोई टिकट नहीं। नया टिकट बनाने के लिए Need Help का उपयोग करें।', 'Abhi koi ticket nahi. Naya ticket banane ke liye Need Help use karo.')

  return (
    <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
      <section className="rounded-[26px] border border-white/70 bg-white/85 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-slate-950/70">
        <div className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">{listTitle}</div>
        <div className="max-h-[520px] space-y-2 overflow-auto pr-1">
          {tickets.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 px-3 py-4 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">{emptyText}</div> : null}
          {tickets.map((ticket: SupportTicket) => {
            const active = selectedId === ticket.id
            return (
              <button
                key={ticket.id}
                type="button"
                onClick={() => setSelectedId(ticket.id)}
                className={`w-full rounded-2xl border p-3 text-left transition ${
                  active
                    ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-950'
                    : 'border-slate-200 bg-white text-slate-900 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="truncate text-sm font-semibold">{ticket.subject}</div>
                  {ticket.unread ? <span className="h-2.5 w-2.5 rounded-full bg-rose-500" /> : null}
                </div>
                <div className={`mt-1 text-xs ${active ? 'text-slate-200 dark:text-slate-100' : 'text-slate-500 dark:text-slate-300'}`}>
                  {isSuperAdmin ? ticket.businessName : ticket.createdByName}
                </div>
                <div className={`mt-1 line-clamp-2 text-xs ${active ? 'text-slate-200 dark:text-slate-100' : 'text-slate-500 dark:text-slate-300'}`}>
                  {ticket.lastMessagePreview ?? t('No messages yet', 'अभी कोई संदेश नहीं', 'Abhi koi message nahi')}
                </div>
              </button>
            )
          })}
        </div>
      </section>

      <section className="rounded-[26px] border border-white/70 bg-white/85 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-slate-950/70">
        {!isSuperAdmin ? (
          <form
            onSubmit={(event) => {
              event.preventDefault()
              const text = firstMessage.trim()
              if (!text) return
              const sub = subject.trim()
              createTicket.mutate({ ...(sub ? { subject: sub } : {}), message: text })
            }}
            className="mb-4 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"
          >
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">{t('Need Help', 'मदद चाहिए', 'Need Help')}</div>
            <input
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder={t('Subject (optional)', 'विषय (वैकल्पिक)', 'Subject (optional)')}
              className="mb-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
            <textarea
              value={firstMessage}
              onChange={(event) => setFirstMessage(event.target.value)}
              placeholder={t('Describe your issue...', 'अपनी समस्या लिखें...', 'Apni problem likho...')}
              className="mb-2 min-h-[90px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              required
            />
            <button
              type="submit"
              disabled={createTicket.isPending}
              className="rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold text-white dark:bg-sky-500 dark:text-slate-950"
            >
              {createTicket.isPending ? t('Sending...', 'भेजा जा रहा है...', 'Bheja ja raha hai...') : t('Send ticket', 'टिकट भेजें', 'Ticket bhejo')}
            </button>
          </form>
        ) : null}

        {selectedTicket ? (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-lg font-semibold text-slate-950 dark:text-white">{selectedTicket.subject}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {selectedTicket.businessName} • {fmtDateTime(selectedTicket.lastMessageAt)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusChip(selectedTicket.status)}`}>{selectedTicket.status}</span>
                {isSuperAdmin ? (
                  <button
                    type="button"
                    onClick={() => updateStatus.mutate({ ticketId: selectedTicket.id, status: selectedTicket.status === 'OPEN' ? 'RESOLVED' : 'OPEN' })}
                    className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 dark:border-slate-600 dark:text-slate-200"
                  >
                    {language === 'hi'
                      ? `${selectedTicket.status === 'OPEN' ? 'रिज़ॉल्व्ड' : 'ओपन'} मार्क करें`
                      : language === 'hinglish'
                        ? `${selectedTicket.status === 'OPEN' ? 'Resolved' : 'Open'} mark karo`
                        : `Mark ${selectedTicket.status === 'OPEN' ? 'Resolved' : 'Open'}`}
                  </button>
                ) : null}
              </div>
            </div>

            <div className="max-h-[380px] space-y-2 overflow-auto rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
              {(ticketDetail.data?.messages ?? []).map((message) => {
                const mine = isSuperAdmin ? message.senderRole === 'ADMIN' : message.senderRole === 'BUSINESS'
                return (
                  <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[84%] rounded-2xl px-3 py-2 text-sm ${mine ? 'bg-slate-950 text-white dark:bg-sky-500 dark:text-slate-950' : 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100'}`}>
                      <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] opacity-70">{message.senderName}</div>
                      {editingMessageId === message.id ? (
                        <div className="space-y-2">
                          <textarea
                            value={editingValue}
                            onChange={(event) => setEditingValue(event.target.value)}
                            className="min-h-[74px] w-full rounded-xl border border-white/30 bg-white/10 px-2 py-1.5 text-sm text-inherit"
                          />
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingMessageId(null)
                                setEditingValue('')
                              }}
                              className="rounded-full border border-white/40 px-2.5 py-1 text-[11px] font-semibold opacity-90"
                            >
                              {t('Cancel', 'रद्द करें', 'Cancel')}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (!selectedTicket) return
                                const text = editingValue.trim()
                                if (!text) return
                                editMessage.mutate({ ticketId: selectedTicket.id, messageId: message.id, message: text })
                              }}
                              className="rounded-full border border-white/40 px-2.5 py-1 text-[11px] font-semibold opacity-90"
                            >
                              {t('Save', 'सेव करें', 'Save')}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="whitespace-pre-wrap">{message.message}</div>
                      )}
                      <div className="mt-1 text-[10px] opacity-70">{fmtDateTime(message.createdAt)}</div>
                      {mine && editingMessageId !== message.id ? (
                        <div className="mt-1.5 flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingMessageId(message.id)
                              setEditingValue(message.message)
                            }}
                            className="text-[10px] font-semibold uppercase tracking-[0.12em] opacity-75 hover:opacity-100"
                          >
                            {t('Edit', 'संपादित करें', 'Edit')}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (!selectedTicket) return
                              if (!window.confirm(t('Delete this message?', 'क्या यह संदेश हटाना है?', 'Kya yeh message delete karna hai?'))) return
                              deleteMessage.mutate({ ticketId: selectedTicket.id, messageId: message.id })
                            }}
                            className="text-[10px] font-semibold uppercase tracking-[0.12em] opacity-75 hover:opacity-100"
                          >
                            {t('Delete', 'हटाएं', 'Delete')}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault()
                const msg = messageInput.trim()
                if (!msg || !selectedTicket) return
                sendMessage.mutate({ ticketId: selectedTicket.id, message: msg })
              }}
              className="mt-3 flex gap-2"
            >
              <textarea
                value={messageInput}
                onChange={(event) => setMessageInput(event.target.value)}
                placeholder={
                  selectedTicket.status === 'RESOLVED'
                    ? t('Ticket is resolved. Reply to reopen.', 'टिकट रिज़ॉल्व है। दोबारा खोलने के लिए जवाब दें।', 'Ticket resolved hai. Reopen ke liye reply karo.')
                    : t('Type message...', 'संदेश लिखें...', 'Message likho...')
                }
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    const msg = messageInput.trim()
                    if (!msg || !selectedTicket) return
                    sendMessage.mutate({ ticketId: selectedTicket.id, message: msg })
                  }
                }}
                rows={2}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
              <button
                type="submit"
                disabled={sendMessage.isPending}
                className="rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold text-white dark:bg-sky-500 dark:text-slate-950"
              >
                {t('Send', 'भेजें', 'Send')}
              </button>
            </form>
          </>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
            {t('Select a ticket to open conversation.', 'कन्वर्सेशन खोलने के लिए टिकट चुनें।', 'Conversation kholne ke liye ticket select karo.')}
          </div>
        )}
      </section>
    </div>
  )
}
