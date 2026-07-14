'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useI18n } from '@/lib/i18n'

type ChatTurn = { role: 'user' | 'assistant'; content: string }

function SparkIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M12 3v4m0 10v4m9-9h-4M7 12H3m14.5-6.5-2.8 2.8M9.3 14.7l-2.8 2.8m11 0-2.8-2.8M9.3 9.3 6.5 6.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function buildTranscript(messages: ChatTurn[]) {
  return messages
    .map((m) => (m.role === 'user' ? `User: ${m.content}` : `AI Assistant: ${m.content}`))
    .join('\n\n')
}

export function SupportAssistantPanel({
  variant = 'panel',
  onEscalated,
}: {
  variant?: 'panel' | 'modal'
  onEscalated?: (ticketId: string) => void
}) {
  const { language } = useI18n()
  const t = (en: string, hi: string, hinglish?: string) =>
    language === 'hi' ? hi : language === 'hinglish' ? (hinglish ?? en) : en
  const router = useRouter()
  const qc = useQueryClient()

  const [messages, setMessages] = useState<ChatTurn[]>([])
  const [input, setInput] = useState('')
  const [pending, setPending] = useState(false)
  const [escalating, setEscalating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  const suggestions = [
    t('How do I add a customer?', 'ग्राहक कैसे जोड़ें?', 'Customer kaise add karun?'),
    t('How to record a payment?', 'पेमेंट कैसे रिकॉर्ड करें?', 'Payment kaise record karun?'),
    t('How do I create a new order?', 'नया ऑर्डर कैसे बनाएं?', 'Naya order kaise banaun?'),
    t('What is Khata?', 'खाता क्या है?', 'Khata kya hai?'),
  ]

  const hasConversation = messages.some((m) => m.role === 'assistant')

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, pending])

  async function ask(question: string) {
    const text = question.trim()
    if (!text || pending) return
    setError(null)
    const history = messages.slice(-6)
    setMessages((prev) => [...prev, { role: 'user', content: text }])
    setInput('')
    setPending(true)
    try {
      const answer = await api
        .post('/api/support/assistant', { message: text, language, history })
        .then((r) => r.data.data.answer as string)
      setMessages((prev) => [...prev, { role: 'assistant', content: answer }])
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? t('The assistant could not answer. Please send this to the support team.', 'असिस्टेंट जवाब नहीं दे पाया। कृपया इसे सपोर्ट टीम को भेजें।', 'Assistant jawab nahi de paya. Ise support team ko bhejo.')
      setError(msg)
    } finally {
      setPending(false)
    }
  }

  async function escalate() {
    if (escalating || messages.length === 0) return
    setError(null)
    setEscalating(true)
    const firstQuestion = messages.find((m) => m.role === 'user')?.content ?? 'Support request'
    const subject = firstQuestion.length > 70 ? `${firstQuestion.slice(0, 70)}…` : firstQuestion
    const body = [
      t('Escalated from the AI assistant. Conversation so far:', 'एआई असिस्टेंट से भेजा गया। अब तक की बातचीत:', 'AI assistant se bheja gaya. Ab tak ki baatchit:'),
      '',
      buildTranscript(messages),
    ].join('\n')
    try {
      const ticketId = await api
        .post('/api/support/tickets', { subject, message: body })
        .then((r) => r.data.data.ticketId as string)
      qc.invalidateQueries({ queryKey: ['support', 'tickets'] })
      qc.invalidateQueries({ queryKey: ['support', 'notifications'] })
      qc.invalidateQueries({ queryKey: ['support', 'notifications', 'unread-count'] })
      if (onEscalated) onEscalated(ticketId)
      else router.push(`/tickets?ticketId=${ticketId}`)
    } catch (err: any) {
      setError(err?.response?.data?.error ?? t('Could not send to support team. Please try again.', 'सपोर्ट टीम को नहीं भेज सके। पुनः प्रयास करें।', 'Support team ko nahi bhej paye. Dobara try karo.'))
    } finally {
      setEscalating(false)
    }
  }

  const chatBody = (
    <>
      <div className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-violet-500 text-white shadow-sm">
          <SparkIcon className="h-5 w-5" />
        </span>
        <div>
          <div className="text-sm font-semibold text-slate-950 dark:text-white">{t('AI Assistant', 'एआई असिस्टेंट', 'AI Assistant')}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {t('Get instant answers about using the app.', 'ऐप इस्तेमाल करने के बारे में तुरंत जवाब पाएं।', 'App use karne ke bare me turant jawab pao.')}
          </div>
        </div>
      </div>

      <div
        ref={scrollRef}
        className={`mt-4 space-y-3 overflow-auto rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900 ${
          variant === 'modal' ? 'max-h-[46vh] min-h-[200px]' : 'max-h-[320px] min-h-[120px]'
        }`}
      >
        {messages.length === 0 && !pending ? (
          <div className="space-y-3">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {t('Ask me anything about NexaHub. Try:', 'NexaHub के बारे में कुछ भी पूछें। जैसे:', 'NexaHub ke bare me kuch bhi poocho. Jaise:')}
            </div>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => ask(s)}
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
                m.role === 'user'
                  ? 'bg-slate-950 text-white dark:bg-sky-500 dark:text-slate-950'
                  : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100'
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}

        {pending ? (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-slate-100 px-3 py-2 text-sm text-slate-500 dark:bg-slate-800 dark:text-slate-300">
              {t('Thinking…', 'सोच रहा हूँ…', 'Soch raha hoon…')}
            </div>
          </div>
        ) : null}
      </div>

      {error ? <div className="mt-2 text-xs text-rose-600 dark:text-rose-400">{error}</div> : null}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          ask(input)
        }}
        className="mt-3 flex items-end gap-2"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              ask(input)
            }
          }}
          placeholder={t('Type your question…', 'अपना सवाल लिखें…', 'Apna sawaal likho…')}
          className="min-h-[44px] max-h-32 flex-1 resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
        />
        <button
          type="submit"
          disabled={pending || input.trim().length < 2}
          className="rounded-full bg-slate-950 px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950"
        >
          {t('Ask', 'पूछें', 'Poocho')}
        </button>
      </form>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] text-slate-400 dark:text-slate-500">
          {t('Still stuck? Send this chat to the support team.', 'अभी भी अटके हैं? यह चैट सपोर्ट टीम को भेजें।', 'Abhi bhi atke ho? Ye chat support team ko bhejo.')}
        </div>
        <button
          type="button"
          onClick={escalate}
          disabled={!hasConversation || escalating}
          className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition enabled:hover:bg-slate-50 disabled:opacity-40 dark:border-slate-600 dark:text-slate-200 dark:enabled:hover:bg-slate-800"
        >
          {escalating ? t('Sending…', 'भेजा जा रहा है…', 'Bhej rahe hain…') : t('Send to support team', 'सपोर्ट टीम को भेजें', 'Support team ko bhejo')}
        </button>
      </div>
    </>
  )

  if (variant === 'modal') return <div>{chatBody}</div>

  return (
    <section className="mb-4 rounded-[26px] border border-white/70 bg-white/85 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-slate-950/70">
      {chatBody}
    </section>
  )
}
