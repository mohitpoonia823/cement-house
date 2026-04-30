'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { Badge } from '@/components/ui/Badge'
import { Card, SectionHeader } from '@/components/ui/Card'
import { api } from '@/lib/api'
import { fmt, fmtDate } from '@/lib/utils'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useCreateStaff, useDeleteStaff, useStaff, useUpdateStaff } from '@/hooks/useStaff'
import { useAuthStore } from '@/store/auth'
import { useI18n } from '@/lib/i18n'

function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get('/api/settings').then((r) => r.data.data),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: 1,
  })
}

const PERMISSION_OPTIONS = [
  { id: 'orders', label: 'Orders' },
  { id: 'customers', label: 'Customers' },
  { id: 'ledger', label: 'Khata / Ledger' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'delivery', label: 'Delivery' },
]

type BillingInterval = 'MONTHLY' | 'YEARLY'
type AlertTone = 'success' | 'warning' | 'danger' | 'info'
type ToastItem = { id: number; tone: AlertTone; message: string }

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, any>) => {
      open: () => void
      on: (event: string, callback: (response: any) => void) => void
    }
  }
}

function getAlertMessage(error: any, fallback: string) {
  return error?.response?.data?.error ?? error?.message ?? fallback
}

async function ensureRazorpayLoaded() {
  if (typeof window === 'undefined') return false
  if (window.Razorpay) return true

  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector('script[data-razorpay="checkout"]') as HTMLScriptElement | null
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('Failed to load Razorpay checkout script.')), { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.async = true
    script.dataset.razorpay = 'checkout'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Razorpay checkout script.'))
    document.body.appendChild(script)
  })

  return Boolean(window.Razorpay)
}

export default function SettingsPage() {
  const { language } = useI18n()
  const t = (en: string, hi: string, hinglish?: string) => (language === 'hi' ? hi : language === 'hinglish' ? (hinglish ?? en) : en)
  const { user, login, token } = useAuthStore()
  const qc = useQueryClient()
  const { data, isLoading } = useSettings()
  const accessLocked = Boolean(data?.subscription?.accessLocked)

  const { data: staffList, isLoading: sLoading } = useStaff({ enabled: user?.role === 'OWNER' && !accessLocked })
  const createStaff = useCreateStaff()
  const updateStaff = useUpdateStaff()
  const deleteStaff = useDeleteStaff()

  const [alert, setAlert] = useState<{ tone: AlertTone; message: string } | null>(null)
  const [bizEdit, setBizEdit] = useState(false)
  const [bizName, setBizName] = useState('')
  const [bizCity, setBizCity] = useState('')
  const [bizAddr, setBizAddr] = useState('')
  const [bizPhone, setBizPhone] = useState('')
  const [bizGstin, setBizGstin] = useState('')
  const [bizType, setBizType] = useState<'GENERAL' | 'CEMENT' | 'HARDWARE_SANITARY' | 'KIRYANA' | 'CUSTOM'>('GENERAL')
  const [bizTypeName, setBizTypeName] = useState('')
  const [labelInventory, setLabelInventory] = useState('')
  const [labelMaterial, setLabelMaterial] = useState('')
  const [labelCustomer, setLabelCustomer] = useState('')

  const [profEdit, setProfEdit] = useState(false)
  const [profName, setProfName] = useState('')
  const [profPhone, setProfPhone] = useState('')
  const [profEmail, setProfEmail] = useState('')

  const [showPw, setShowPw] = useState(false)
  const [curPw, setCurPw] = useState('')
  const [newPw, setNewPw] = useState('')

  const [remEdit, setRemEdit] = useState(false)
  const [remEnabled, setRemEnabled] = useState(true)
  const [remSoft, setRemSoft] = useState(7)
  const [remFollow, setRemFollow] = useState(15)
  const [remFirm, setRemFirm] = useState(30)

  const [staffFormOpen, setStaffFormOpen] = useState(false)
  const [staffEditId, setStaffEditId] = useState<string | null>(null)
  const [staffName, setStaffName] = useState('')
  const [staffPhone, setStaffPhone] = useState('')
  const [staffEmail, setStaffEmail] = useState('')
  const [staffPassword, setStaffPassword] = useState('')
  const [staffPerms, setStaffPerms] = useState<Set<string>>(new Set())

  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [selectedInterval, setSelectedInterval] = useState<BillingInterval>('MONTHLY')
  const [isConfirmingPayment, setIsConfirmingPayment] = useState(false)
  const [logoutReason, setLogoutReason] = useState('')
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const selectedPlanAmount = selectedInterval === 'YEARLY' ? fmt(data?.subscription?.yearlyPrice ?? 0) : fmt(data?.subscription?.monthlyPrice ?? 0)
  const canCancelSubscription =
    Boolean(data?.subscription?.interval) &&
    Boolean(data?.subscription?.endsAt) &&
    !data?.subscription?.accessLocked &&
    data?.subscription?.status !== 'CANCELLED'

  const isCurrentPlanActive = (interval: BillingInterval) => {
    const status = data?.subscription?.status
    const daysRemaining = Number(data?.subscription?.daysRemaining ?? 0)
    const stillInCurrentCycle = status === 'ACTIVE' || (status === 'CANCELLED' && daysRemaining > 0)
    return !accessLocked && stillInCurrentCycle && data?.subscription?.interval === interval
  }

  const hasActiveCycleWindow = Boolean(data?.subscription?.endsAt) && new Date(data?.subscription?.endsAt).getTime() > Date.now()
  const hasActiveYearlyCycle = data?.subscription?.interval === 'YEARLY' && hasActiveCycleWindow
  const hasActiveMonthlyCycle = data?.subscription?.interval === 'MONTHLY' && hasActiveCycleWindow
  const canPurchaseMonthly = !hasActiveYearlyCycle

  const monthlyPlanSub = hasActiveYearlyCycle ? 'Available after yearly cycle ends' : '30-day access window'
  const monthlyPlanStatusLabel = isCurrentPlanActive('MONTHLY') ? 'Current plan' : hasActiveYearlyCycle ? 'Unavailable' : undefined
  const monthlyPlanCta = isCurrentPlanActive('MONTHLY') ? 'Subscribed' : hasActiveYearlyCycle ? 'Unavailable' : 'Activate Monthly'

  const yearlyPlanStatusLabel = isCurrentPlanActive('YEARLY') ? 'Current plan' : hasActiveMonthlyCycle ? 'Upgrade available' : 'Best value'
  const yearlyPlanCta = isCurrentPlanActive('YEARLY') ? 'Subscribed' : hasActiveMonthlyCycle ? 'Upgrade to Yearly' : 'Activate Yearly'

  const trialBannerMessage = useMemo(() => {
    if (!data?.subscription?.inTrial || data?.subscription?.interval) return ''
    const daysRemaining = data?.subscription?.daysRemaining ?? 0
    if (daysRemaining <= 0) return 'Your free trial has ended. Subscribe now to keep accessing the full platform.'
    return `${daysRemaining} day${daysRemaining === 1 ? '' : 's'} remaining in your free trial. Get a subscription to continue using the full platform without interruption.`
  }, [data?.subscription?.daysRemaining, data?.subscription?.inTrial, data?.subscription?.interval])

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id))
  }, [])

  const pushToast = useCallback((tone: AlertTone, message: string) => {
    const id = Date.now() + Math.floor(Math.random() * 1000)
    setToasts((prev) => [...prev, { id, tone, message }])
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id))
    }, 4200)
  }, [])

  useEffect(() => {
    const reason = sessionStorage.getItem('auth_logout_reason') ?? ''
    if (reason) {
      sessionStorage.removeItem('auth_logout_reason')
      setLogoutReason(reason)
    }
  }, [])

  useEffect(() => {
    if (!data || !logoutReason) return
    const daysRemaining = Number(data?.subscription?.daysRemaining ?? 0)
    if (data?.subscription?.accessLocked || daysRemaining <= 0) {
      setAlert({ tone: 'warning', message: logoutReason })
    }
    setLogoutReason('')
  }, [data, logoutReason])

  useEffect(() => {
    if (!data) return
    setBizName(data.business?.name ?? '')
    setBizCity(data.business?.city ?? '')
    setBizAddr(data.business?.address ?? '')
    setBizPhone(data.business?.phone ?? '')
    setBizGstin(data.business?.gstin ?? '')
    setBizType(data.business?.businessType ?? 'GENERAL')
    setBizTypeName(data.business?.customLabels?.businessTypeName ?? '')
    setLabelInventory(data.business?.customLabels?.inventory ?? '')
    setLabelMaterial(data.business?.customLabels?.material ?? '')
    setLabelCustomer(data.business?.customLabels?.customer ?? '')
    setProfName(data.user?.name ?? '')
    setProfPhone(data.user?.phone ?? '')
    setProfEmail(data.user?.email ?? '')
    setRemEnabled(data.business?.remindersEnabled ?? true)
    setRemSoft(data.business?.reminderSoftDays ?? 7)
    setRemFollow(data.business?.reminderFollowDays ?? 15)
    setRemFirm(data.business?.reminderFirmDays ?? 30)
    // Heal stale persisted auth flags if backend now reports active access.
    if (token && user && user.accessLocked && !data.subscription?.accessLocked) {
      login(token, {
        ...user,
        accessLocked: false,
        accessReason: null,
        subscriptionStatus: data.subscription?.status ?? user.subscriptionStatus ?? null,
        subscriptionEndsAt: data.subscription?.endsAt ?? user.subscriptionEndsAt ?? null,
        subscriptionInterval: data.subscription?.interval ?? user.subscriptionInterval ?? null,
      })
    }
  }, [data, login, token, user])

  const updateBiz = useMutation({
    mutationFn: (payload: any) => api.patch('/api/settings/business', payload).then((r) => r.data.data),
    onSuccess: (biz) => {
      qc.invalidateQueries({ queryKey: ['settings'] })
      setBizEdit(false)
      if (token && user) {
        login(token, {
          ...user,
          businessName: biz.name,
          businessCity: biz.city,
          businessType: biz.businessType ?? user.businessType ?? 'GENERAL',
          customLabels: biz.customLabels ?? user.customLabels ?? null,
        })
      }
      setAlert({ tone: 'success', message: 'Business details updated successfully.' })
    },
    onError: (error) => setAlert({ tone: 'danger', message: getAlertMessage(error, 'Failed to update business details.') }),
  })

  const updateProf = useMutation({
    mutationFn: (payload: any) => api.patch('/api/settings/profile', payload).then((r) => r.data.data),
    onSuccess: (nextUser) => {
      qc.invalidateQueries({ queryKey: ['settings'] })
      setProfEdit(false)
      if (token && user) login(token, { ...user, name: nextUser.name })
      setAlert({ tone: 'success', message: 'Profile updated successfully.' })
    },
    onError: (error) => setAlert({ tone: 'danger', message: getAlertMessage(error, 'Failed to update profile.') }),
  })

  const changePw = useMutation({
    mutationFn: (payload: any) => api.post('/api/settings/change-password', payload).then((r) => r.data),
    onSuccess: () => {
      setShowPw(false)
      setCurPw('')
      setNewPw('')
      setAlert({ tone: 'success', message: 'Password changed successfully.' })
    },
    onError: (error) => setAlert({ tone: 'danger', message: getAlertMessage(error, 'Failed to change password.') }),
  })

  const updateRem = useMutation({
    mutationFn: (payload: any) => api.patch('/api/settings/reminders', payload).then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] })
      setRemEdit(false)
      setAlert({ tone: 'success', message: 'Reminder rules updated successfully.' })
    },
    onError: (error) => setAlert({ tone: 'danger', message: getAlertMessage(error, 'Failed to update reminder rules.') }),
  })


  const cancelSubscription = useMutation({
    mutationFn: () => api.post('/api/settings/subscription/cancel', {}).then((r) => r.data.data),
    onSuccess: (result) => {
      if (result?.session?.token && result?.session?.user) {
        login(result.session.token, result.session.user)
      }
      qc.invalidateQueries({ queryKey: ['settings'] })
      setAlert({
        tone: 'info',
        message: result?.message ?? 'Subscription cancelled. Current cycle remains active until access end date.',
      })
    },
    onError: (error) => {
      setAlert({ tone: 'danger', message: getAlertMessage(error, 'Failed to cancel subscription.') })
    },
  })

  function openCheckout(interval: BillingInterval) {
    if (interval === 'MONTHLY' && hasActiveYearlyCycle) {
      const endsAt = data?.subscription?.endsAt ? fmtDate(data.subscription.endsAt) : 'your current yearly end date'
      const message = `Monthly downgrade is unavailable while yearly plan is active. You can switch after ${endsAt}.`
      setAlert({ tone: 'warning', message })
      pushToast('warning', message)
      return
    }
    setSelectedInterval(interval)
    setCheckoutOpen(true)
  }

  async function handleCheckoutConfirm() {
    try {
      setIsConfirmingPayment(true)
      const razorpayReady = await ensureRazorpayLoaded()
      if (!razorpayReady || !window.Razorpay) {
        throw new Error('Unable to initialize Razorpay checkout. Please refresh and try again.')
      }

      const initiate = await api
        .post('/api/settings/subscription/checkout/initiate', {
          interval: selectedInterval,
        })
        .then((r) => r.data.data)

      const RazorpayCtor = window.Razorpay
      if (!RazorpayCtor) {
        throw new Error('Razorpay checkout is unavailable. Please refresh and try again.')
      }

      const verifiedResult = await new Promise<any>((resolve, reject) => {
        const rz = new RazorpayCtor({
          key: initiate.razorpay.keyId,
          amount: initiate.razorpay.amount,
          currency: initiate.razorpay.currency,
          name: initiate.razorpay.name,
          description: initiate.razorpay.description,
          order_id: initiate.razorpay.orderId,
          prefill: initiate.razorpay.prefill,
          notes: {
            transactionId: initiate.transactionId,
            interval: selectedInterval,
          },
          modal: {
            ondismiss: () => reject(new Error('Payment popup was closed before completion.')),
          },
          handler: async (response: any) => {
            try {
              const verified = await api
                .post('/api/settings/subscription/checkout/verify', {
                  transactionId: initiate.transactionId,
                  interval: selectedInterval,
                  razorpayOrderId: response.razorpay_order_id,
                  razorpayPaymentId: response.razorpay_payment_id,
                  razorpaySignature: response.razorpay_signature,
                })
                .then((r) => r.data.data)
              resolve(verified)
            } catch (error) {
              reject(error)
            }
          },
          theme: { color: '#0f172a' },
        })

        rz.on('payment.failed', (response: any) => {
          reject(new Error(response?.error?.description ?? 'Payment failed.'))
        })
        rz.open()
      })

      if (verifiedResult?.session?.token && verifiedResult?.session?.user) {
        login(verifiedResult.session.token, verifiedResult.session.user)
      }
      qc.invalidateQueries({ queryKey: ['settings'] })
      setCheckoutOpen(false)
      const intervalLabel = verifiedResult.interval === 'YEARLY' ? 'yearly' : 'monthly'
      setAlert({
        tone: 'success',
        message: `Payment confirmed successfully. Your ${intervalLabel} subscription is active until ${fmtDate(verifiedResult.endsAt)} and the workspace is now unlocked.`,
      })
      pushToast('success', `Payment successful. ${intervalLabel === 'yearly' ? 'Yearly' : 'Monthly'} subscription is now active.`)
    } catch (error) {
      const message = getAlertMessage(error, 'Payment failed. Please try again.')
      setAlert({ tone: 'danger', message })
      pushToast('danger', message)
    } finally {
      setIsConfirmingPayment(false)
    }
  }

  function handleStaffSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmedStaffEmail = staffEmail.trim()
    const payload = { name: staffName, phone: staffPhone, email: trimmedStaffEmail || null, permissions: Array.from(staffPerms) }
    if (staffEditId) {
      updateStaff.mutate(
        { id: staffEditId, ...payload },
        {
          onSuccess: () => {
            setStaffFormOpen(false)
            setStaffEditId(null)
            setAlert({ tone: 'success', message: 'Staff member updated successfully.' })
          },
          onError: (error) => setAlert({ tone: 'danger', message: getAlertMessage(error, 'Failed to update staff member.') }),
        }
      )
      return
    }

    createStaff.mutate(
      { ...payload, password: staffPassword },
      {
        onSuccess: () => {
          setStaffFormOpen(false)
          setStaffName('')
          setStaffPhone('')
          setStaffEmail('')
          setStaffPassword('')
          setStaffPerms(new Set())
          setAlert({ tone: 'success', message: 'Staff member added successfully.' })
        },
        onError: (error) => setAlert({ tone: 'danger', message: getAlertMessage(error, 'Failed to add staff member.') }),
      }
    )
  }

  function openStaffEdit(nextUser: any) {
    setStaffEditId(nextUser.id)
    setStaffName(nextUser.name)
    setStaffPhone(nextUser.phone)
    setStaffEmail(nextUser.email ?? '')
    setStaffPassword('')
    setStaffPerms(new Set(nextUser.permissions ?? []))
    setStaffFormOpen(true)
  }

  if (isLoading) {
    return <AppShell><div className="text-sm text-slate-500">{language === 'hi' ? 'सेटिंग्स लोड हो रही हैं...' : language === 'hinglish' ? 'Settings load ho rahi hain...' : 'Loading settings...'}</div></AppShell>
  }

  const settingsCardCls = 'rounded-[24px] p-4 md:p-5'

  return (
    <AppShell>
      <SectionHeader
        eyebrow={language === 'hi' ? 'वर्कस्पेस एडमिनिस्ट्रेशन' : 'Workspace administration'}
        title={language === 'hi' ? 'सेटिंग्स' : 'Settings'}
        description={language === 'hi' ? 'बिज़नेस प्रोफाइल, रिमाइंडर, ओनर प्रोफाइल और सब्सक्रिप्शन मैनेज करें।' : language === 'hinglish' ? 'Business profile, reminders, owner profile aur subscription manage karo.' : 'Manage business identity, reminders, owner profile, subscription access, and renewal setup.'}
      />

      {trialBannerMessage ? <AlertBanner tone="warning" message={trialBannerMessage} className="mb-5 max-w-6xl" /> : null}

      <div className="max-w-6xl space-y-4">
        <Card className={settingsCardCls}>
          <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('Subscription & renewal', 'सब्सक्रिप्शन और रिन्यूअल')}</div>
              <div className="mt-1.5 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">
                {data?.subscription?.inTrial ? t('Free trial access', 'मुफ्त ट्रायल एक्सेस') : t('Paid subscription access', 'पेड सब्सक्रिप्शन एक्सेस')}
              </div>
              <div className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                {data?.subscription?.accessReason || t('Your workspace keeps a saved card ready for quick renewal.', 'आपके वर्कस्पेस में जल्दी रिन्यूअल के लिए कार्ड सेव रहता है।')}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant={accessLocked ? 'warning' : 'success'}>{data?.subscription?.status}</Badge>
              {data?.subscription?.interval ? <Badge>{data.subscription.interval}</Badge> : <Badge variant="info">TRIAL</Badge>}
              {canCancelSubscription ? (
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(t('Cancel auto-renewal for the current subscription? Access will continue until the current end date.', 'क्या मौजूदा सब्सक्रिप्शन का ऑटो-रिन्यूअल बंद करना है? एक्सेस मौजूदा एंड डेट तक जारी रहेगा।'))) {
                      cancelSubscription.mutate()
                    }
                  }}
                  disabled={cancelSubscription.isPending}
                  className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-rose-700 hover:bg-rose-100 disabled:opacity-60 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200"
                >
                  {cancelSubscription.isPending ? t('Cancelling...', 'रद्द किया जा रहा है...') : t('Cancel subscription', 'सब्सक्रिप्शन रद्द करें')}
                </button>
              ) : null}
            </div>
          </div>

          {alert ? <AlertBanner tone={alert.tone} message={alert.message} className="mb-3" /> : null}

          <div className="grid items-start gap-3 xl:grid-cols-[1fr_1fr_1.15fr]">
            <InfoTile
              label="Current access"
              value={data?.subscription?.endsAt ? fmtDate(data.subscription.endsAt) : 'Not active'}
              hint={
                data?.subscription?.daysRemaining !== undefined
                  ? `${data.subscription.daysRemaining} day${data.subscription.daysRemaining === 1 ? '' : 's'} remaining`
                  : 'No active window'
              }
            />
            <InfoTile
              label="Payment method"
              value={data?.subscription?.paymentMethod ? `${data.subscription.paymentMethod.brand} **** ${data.subscription.paymentMethod.last4}` : 'Choose in Razorpay'}
              hint={
                data?.subscription?.paymentMethod
                  ? `Cardholder ${data.subscription.paymentMethod.cardholderName}`
                  : 'Select a payment method directly in Razorpay checkout'
              }
            />
            <div className="rounded-[20px] border border-slate-200/70 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/60">
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">Choose a plan</div>
              <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                <PlanOption
                  title="Monthly"
                  amount={fmt(data?.subscription?.monthlyPrice ?? 0)}
                  sub={monthlyPlanSub}
                  statusLabel={monthlyPlanStatusLabel}
                  onClick={() => openCheckout('MONTHLY')}
                  busy={isConfirmingPayment && selectedInterval === 'MONTHLY'}
                  subscribed={isCurrentPlanActive('MONTHLY')}
                  disabled={!canPurchaseMonthly}
                  ctaLabel={monthlyPlanCta}
                />
                <PlanOption
                  title="Yearly"
                  amount={fmt(data?.subscription?.yearlyPrice ?? 0)}
                  sub="365-day access window"
                  statusLabel={yearlyPlanStatusLabel}
                  onClick={() => openCheckout('YEARLY')}
                  busy={isConfirmingPayment && selectedInterval === 'YEARLY'}
                  subscribed={isCurrentPlanActive('YEARLY')}
                  ctaLabel={yearlyPlanCta}
                />
              </div>
            </div>
          </div>

        </Card>

        {accessLocked ? (
          <Card className={settingsCardCls}>
            <div className="text-lg font-semibold text-slate-950 dark:text-white">{t('Workspace locked for billing', 'बिलिंग के कारण वर्कस्पेस लॉक है')}</div>
            <div className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              {t('Renew a subscription above to unlock business management, reminders, staff operations, and the rest of the workspace.', 'ऊपर से सब्सक्रिप्शन रिन्यू करें ताकि बिज़नेस मैनेजमेंट, रिमाइंडर, स्टाफ ऑपरेशन और बाकी वर्कस्पेस अनलॉक हो जाए।')}
            </div>
          </Card>
        ) : (
          <>
            <div className="grid items-start gap-4 xl:grid-cols-2">
              <Card className={settingsCardCls}>
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('Business info', 'बिज़नेस जानकारी')}</div>
                  {!bizEdit && user?.role === 'OWNER' ? <button onClick={() => setBizEdit(true)} className={editBtnCls}>{t('Edit', 'संपादित करें')}</button> : null}
                </div>
                {bizEdit ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault()
                      updateBiz.mutate({
                        name: bizName,
                        city: bizCity,
                        address: bizAddr || undefined,
                        phone: bizPhone || undefined,
                        gstin: bizGstin || undefined,
                        businessType: bizType,
                        customLabels: {
                          businessTypeName: bizType === 'CUSTOM' ? (bizTypeName || undefined) : undefined,
                          inventory: labelInventory || undefined,
                          material: labelMaterial || undefined,
                          customer: labelCustomer || undefined,
                        },
                      })
                    }}
                    className="space-y-3"
                  >
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <Field label="Business name *"><input value={bizName} onChange={(e) => setBizName(e.target.value)} className={inputCls} /></Field>
                      <Field label="City *"><input value={bizCity} onChange={(e) => setBizCity(e.target.value)} className={inputCls} /></Field>
                    </div>
                    <Field label="Address"><input value={bizAddr} onChange={(e) => setBizAddr(e.target.value)} className={inputCls} /></Field>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <Field label="Phone"><input value={bizPhone} onChange={(e) => setBizPhone(e.target.value)} className={inputCls} /></Field>
                      <Field label="GSTIN"><input value={bizGstin} onChange={(e) => setBizGstin(e.target.value)} className={inputCls} /></Field>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <Field label="Business type">
                        <select value={bizType} onChange={(e) => setBizType(e.target.value as any)} className={inputCls}>
                          <option value="GENERAL">General store</option>
                          <option value="CEMENT">Cement shop</option>
                          <option value="HARDWARE_SANITARY">Hardware / Sanitary</option>
                          <option value="KIRYANA">Kiryana / Grocery</option>
                          <option value="CUSTOM">Custom</option>
                        </select>
                      </Field>
                      {bizType === 'CUSTOM' ? (
                        <Field label="Custom business type">
                          <input value={bizTypeName} onChange={(e) => setBizTypeName(e.target.value)} placeholder="e.g. Electrical store" className={inputCls} />
                        </Field>
                      ) : (
                        <Field label="Inventory label (optional)">
                          <input value={labelInventory} onChange={(e) => setLabelInventory(e.target.value)} placeholder="Inventory" className={inputCls} />
                        </Field>
                      )}
                    </div>
                    {bizType === 'CUSTOM' ? (
                      <Field label="Inventory label (optional)">
                        <input value={labelInventory} onChange={(e) => setLabelInventory(e.target.value)} placeholder="Inventory" className={inputCls} />
                      </Field>
                    ) : null}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <Field label="Material label (optional)"><input value={labelMaterial} onChange={(e) => setLabelMaterial(e.target.value)} placeholder="Material" className={inputCls} /></Field>
                      <Field label="Customer label (optional)"><input value={labelCustomer} onChange={(e) => setLabelCustomer(e.target.value)} placeholder="Customer" className={inputCls} /></Field>
                    </div>
                    <div className="flex gap-2">
                      <button type="submit" disabled={updateBiz.isPending} className={saveBtnCls}>{updateBiz.isPending ? t('Saving...', 'सेव हो रहा है...') : t('Save changes', 'बदलाव सेव करें')}</button>
                      <button type="button" onClick={() => setBizEdit(false)} className={cancelBtnCls}>{t('Cancel', 'रद्द करें')}</button>
                    </div>
                  </form>
                ) : (
                  <DetailsList
                    items={[
                      ['Business name', data?.business?.name],
                      ['City', data?.business?.city],
                      ['Address', data?.business?.address],
                      ['Phone', data?.business?.phone],
                      ['GSTIN', data?.business?.gstin],
                      ['Business type', data?.business?.businessType === 'CUSTOM' ? (data?.business?.customLabels?.businessTypeName ?? 'Custom') : (data?.business?.businessType ?? 'GENERAL')],
                      ['Inventory label', data?.business?.customLabels?.inventory ?? 'Inventory'],
                      ['Material label', data?.business?.customLabels?.material ?? 'Material'],
                      ['Customer label', data?.business?.customLabels?.customer ?? 'Customer'],
                    ]}
                  />
                )}
              </Card>

              <Card className={settingsCardCls}>
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('Your profile', 'आपकी प्रोफाइल')}</div>
                  {!profEdit ? <button onClick={() => setProfEdit(true)} className={editBtnCls}>{t('Edit', 'संपादित करें')}</button> : null}
                </div>
                {profEdit ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault()
                      const trimmedEmail = profEmail.trim()
                      updateProf.mutate({
                        name: profName,
                        phone: profPhone,
                        ...(trimmedEmail ? { email: trimmedEmail } : {}),
                      })
                    }}
                    className="space-y-3"
                  >
                    <Field label="Full name *"><input value={profName} onChange={(e) => setProfName(e.target.value)} className={inputCls} /></Field>
                    <Field label="Phone *"><input value={profPhone} onChange={(e) => setProfPhone(e.target.value)} maxLength={10} className={inputCls} /></Field>
                    <Field label="Email"><input type="email" value={profEmail} onChange={(e) => setProfEmail(e.target.value)} className={inputCls} /></Field>
                    <div className="flex gap-2">
                      <button type="submit" disabled={updateProf.isPending} className={saveBtnCls}>{updateProf.isPending ? t('Saving...', 'सेव हो रहा है...') : t('Save profile', 'प्रोफाइल सेव करें')}</button>
                      <button type="button" onClick={() => setProfEdit(false)} className={cancelBtnCls}>{t('Cancel', 'रद्द करें')}</button>
                    </div>
                  </form>
                ) : (
                  <DetailsList
                    items={[
                      ['Name', data?.user?.name],
                      ['Phone', data?.user?.phone],
                      ['Email', data?.user?.email],
                      ['Role', data?.user?.role],
                    ]}
                  />
                )}
              </Card>
            </div>

            <div className="grid items-start gap-4 xl:grid-cols-2">
              <Card className={settingsCardCls}>
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('Security', 'सिक्योरिटी')}</div>
                  {!showPw ? <button onClick={() => setShowPw(true)} className={editBtnCls}>{t('Change password', 'पासवर्ड बदलें')}</button> : null}
                </div>
                {showPw ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault()
                      changePw.mutate({ currentPassword: curPw, newPassword: newPw })
                    }}
                    className="space-y-3"
                  >
                    <Field label="Current password *"><input type="password" value={curPw} onChange={(e) => setCurPw(e.target.value)} className={inputCls} /></Field>
                    <Field label="New password *"><input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} className={inputCls} /></Field>
                    <div className="flex gap-2">
                      <button type="submit" disabled={changePw.isPending} className={saveBtnCls}>{changePw.isPending ? t('Changing...', 'बदला जा रहा है...') : t('Change password', 'पासवर्ड बदलें')}</button>
                      <button type="button" onClick={() => setShowPw(false)} className={cancelBtnCls}>{t('Cancel', 'रद्द करें')}</button>
                    </div>
                  </form>
                ) : (
                  <div className="text-sm text-slate-500 dark:text-slate-400">{t('Update your password to keep owner access secure.', 'ओनर एक्सेस सुरक्षित रखने के लिए पासवर्ड अपडेट करें।')}</div>
                )}
              </Card>

              <Card className={settingsCardCls}>
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('Reminder rules', 'रिमाइंडर नियम')}</div>
                  {!remEdit ? <button onClick={() => setRemEdit(true)} className={editBtnCls}>{t('Edit', 'संपादित करें')}</button> : null}
                </div>
                {remEdit ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault()
                      updateRem.mutate({ remindersEnabled: remEnabled, reminderSoftDays: remSoft, reminderFollowDays: remFollow, reminderFirmDays: remFirm })
                    }}
                    className="space-y-3"
                  >
                    <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                      <input type="checkbox" checked={remEnabled} onChange={(e) => setRemEnabled(e.target.checked)} />
                      {t('Enable automated payment reminders', 'ऑटोमेटेड पेमेंट रिमाइंडर सक्षम करें')}
                    </label>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <Field label="Soft"><input type="number" value={remSoft} onChange={(e) => setRemSoft(Number(e.target.value))} className={inputCls} /></Field>
                      <Field label="Follow-up"><input type="number" value={remFollow} onChange={(e) => setRemFollow(Number(e.target.value))} className={inputCls} /></Field>
                      <Field label="Firm"><input type="number" value={remFirm} onChange={(e) => setRemFirm(Number(e.target.value))} className={inputCls} /></Field>
                    </div>
                    <div className="flex gap-2">
                      <button type="submit" disabled={updateRem.isPending} className={saveBtnCls}>{updateRem.isPending ? t('Saving...', 'सेव हो रहा है...') : t('Save rules', 'नियम सेव करें')}</button>
                      <button type="button" onClick={() => setRemEdit(false)} className={cancelBtnCls}>{t('Cancel', 'रद्द करें')}</button>
                    </div>
                  </form>
                ) : (
                  <DetailsList
                    items={[
                      ['Auto-reminders', data?.business?.remindersEnabled ? 'Enabled' : 'Disabled'],
                      ['Soft reminder', `${data?.business?.reminderSoftDays ?? 0} days`],
                      ['Follow-up', `${data?.business?.reminderFollowDays ?? 0} days`],
                      ['Firm notice', `${data?.business?.reminderFirmDays ?? 0} days`],
                    ]}
                  />
                )}
              </Card>
            </div>

            {user?.role === 'OWNER' ? (
              <Card className={settingsCardCls}>
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('Staff / Munim settings', 'स्टाफ / मुनीम सेटिंग्स')}</div>
                  {!staffFormOpen ? (
                    <button
                      onClick={() => {
                        setStaffEditId(null)
                        setStaffName('')
                        setStaffPhone('')
                        setStaffEmail('')
                        setStaffPassword('')
                        setStaffPerms(new Set())
                        setStaffFormOpen(true)
                      }}
                      className={editBtnCls}
                    >
                      {t('+ Add Munim', '+ मुनीम जोड़ें')}
                    </button>
                  ) : null}
                </div>

                {staffFormOpen ? (
                  <form onSubmit={handleStaffSubmit} className="mb-3 space-y-3 rounded-[20px] border border-slate-200/70 p-3.5 dark:border-slate-800">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <Field label="Name *"><input value={staffName} onChange={(e) => setStaffName(e.target.value)} className={inputCls} /></Field>
                      <Field label="Phone *"><input value={staffPhone} onChange={(e) => setStaffPhone(e.target.value)} maxLength={10} className={inputCls} /></Field>
                    </div>
                    <Field label="Gmail"><input type="email" value={staffEmail} onChange={(e) => setStaffEmail(e.target.value)} placeholder="munim@gmail.com" className={inputCls} /></Field>
                    {!staffEditId ? <Field label="Password *"><input type="password" value={staffPassword} onChange={(e) => setStaffPassword(e.target.value)} className={inputCls} /></Field> : null}
                    <div>
                      <div className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">{t('Permissions', 'अनुमतियां')}</div>
                      <div className="flex flex-wrap gap-2">
                        {PERMISSION_OPTIONS.map((option) => {
                          const selected = staffPerms.has(option.id)
                          return (
                            <button
                              key={option.id}
                              type="button"
                              onClick={() =>
                                setStaffPerms((current) => {
                                  const next = new Set(current)
                                  selected ? next.delete(option.id) : next.add(option.id)
                                  return next
                                })
                              }
                              className={`rounded-full border px-3 py-1.5 text-xs font-medium ${selected ? 'border-sky-500 bg-sky-500 text-white' : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'}`}
                            >
                              {option.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button type="submit" disabled={createStaff.isPending || updateStaff.isPending} className={saveBtnCls}>
                        {createStaff.isPending || updateStaff.isPending ? t('Saving...', 'सेव हो रहा है...') : t('Save staff', 'स्टाफ सेव करें')}
                      </button>
                      <button type="button" onClick={() => setStaffFormOpen(false)} className={cancelBtnCls}>{t('Cancel', 'रद्द करें')}</button>
                    </div>
                  </form>
                ) : null}

                <div className="space-y-3">
                  {sLoading ? <div className="text-sm text-slate-500">{t('Loading staff...', 'स्टाफ लोड हो रहा है...')}</div> : null}
                  {(staffList ?? []).filter((member: any) => member.isActive).length > 0 ? (
                    <div className="overflow-x-auto rounded-[18px] border border-slate-200/70 dark:border-slate-800">
                      <table className="w-full min-w-[640px] table-fixed text-sm">
                        <thead className="bg-slate-50/85 dark:bg-slate-900/70">
                          <tr className="border-b border-slate-300/85 dark:border-slate-700/90">
                            <th className="w-[140px] px-3.5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-300">Name</th>
                            <th className="w-[150px] px-3.5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-300">Phone</th>
                            <th className="w-[220px] px-3.5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-300">Gmail</th>
                            <th className="px-3.5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-300">Permissions</th>
                            <th className="w-[140px] px-3.5 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-300">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(staffList ?? []).filter((member: any) => member.isActive).map((member: any) => (
                            <tr key={member.id} className="border-b border-slate-300/90 dark:border-slate-700/90">
                              <td className="px-3.5 py-2.5 font-medium text-slate-950 dark:text-white">{member.name}</td>
                              <td className="px-3.5 py-2.5 text-slate-600 dark:text-slate-300">{member.phone}</td>
                              <td className="px-3.5 py-2.5 text-slate-600 dark:text-slate-300">{member.email || '-'}</td>
                              <td className="px-3.5 py-2.5 text-xs text-slate-500 dark:text-slate-400">
                                {member.permissions?.length > 0 ? member.permissions.join(', ') : 'No permissions'}
                              </td>
                              <td className="px-3.5 py-2.5">
                                <div className="flex justify-end gap-3 text-xs">
                                  <button onClick={() => openStaffEdit(member)} className={editBtnCls} type="button">Edit</button>
                                  <button
                                    onClick={() => {
                                      if (window.confirm(`Remove ${member.name}?`)) {
                                        deleteStaff.mutate(member.id, {
                                          onSuccess: () => setAlert({ tone: 'success', message: 'Staff member removed successfully.' }),
                                          onError: (error) => setAlert({ tone: 'danger', message: getAlertMessage(error, 'Failed to remove staff member.') }),
                                        })
                                      }
                                    }}
                                    className="font-medium text-rose-600 hover:underline"
                                    type="button"
                                  >
                                    {t('Remove', 'हटाएं')}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                  {(staffList ?? []).filter((member: any) => member.isActive).length === 0 && !staffFormOpen ? (
                    <div className="text-sm text-slate-500 dark:text-slate-400">{t('No munim accounts added yet.', 'अभी कोई मुनीम अकाउंट नहीं जोड़ा गया।')}</div>
                  ) : null}
                </div>
              </Card>
            ) : null}
          </>
        )}
      </div>

      {checkoutOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-[30px] border border-white/60 bg-white p-6 shadow-[0_30px_90px_rgba(15,23,42,0.22)] dark:border-white/10 dark:bg-slate-950">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-500 dark:text-slate-400">{t('Confirm subscription', 'सब्सक्रिप्शन पुष्टि')}</div>
                <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">
                  {selectedInterval === 'YEARLY' ? t('Activate yearly plan', 'ईयरली प्लान सक्रिय करें') : t('Activate monthly plan', 'मंथली प्लान सक्रिय करें')}
                </div>
                <div className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                  {t('Confirm to open Razorpay secure checkout and complete payment with your preferred method.', 'Razorpay secure checkout खोलने और अपनी पसंद से भुगतान पूरा करने के लिए पुष्टि करें।')}
                </div>
              </div>
              <button type="button" onClick={() => setCheckoutOpen(false)} className={cancelBtnCls}>
                {t('Close', 'बंद करें')}
              </button>
            </div>

            <div className="mt-5 grid gap-4">
              <div className="rounded-[24px] border border-slate-200/70 bg-slate-50/80 p-5 dark:border-slate-800 dark:bg-slate-900/60">
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">{t('Payment summary', 'भुगतान सारांश')}</div>
                <div className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">{selectedPlanAmount}</div>
                <div className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                  {selectedInterval === 'YEARLY' ? t('365-day access window', '365 दिन का एक्सेस') : t('30-day access window', '30 दिन का एक्सेस')}
                </div>
              </div>

              <div className="rounded-[24px] border border-slate-200/70 bg-white/90 p-5 dark:border-slate-800 dark:bg-slate-950/65">
                <div className="text-sm font-semibold text-slate-950 dark:text-white">{t('Pay with Razorpay', 'Razorpay से भुगतान करें')}</div>
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {t('After confirmation, Razorpay opens secure checkout where users can choose card, UPI, netbanking, wallet, or supported methods.', 'पुष्टि के बाद Razorpay का secure checkout खुलेगा जहां card, UPI, netbanking, wallet आदि चुने जा सकते हैं।')}
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => setCheckoutOpen(false)} className={cancelBtnCls}>
                  {t('Cancel', 'रद्द करें')}
                </button>
                  <button
                    type="button"
                    onClick={handleCheckoutConfirm}
                    disabled={isConfirmingPayment}
                    className={saveBtnCls}
                  >
                  {isConfirmingPayment ? t('Opening Razorpay...', 'Razorpay खुल रहा है...') : t('Continue to Razorpay', 'Razorpay पर जारी रखें')}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </AppShell>
  )
}

function AlertBanner({
  tone,
  message,
  className = '',
}: {
  tone: AlertTone
  message: string
  className?: string
}) {
  const tones = {
    success: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-950/30 dark:text-emerald-200',
    warning: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-200',
    danger: 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-950/30 dark:text-rose-200',
    info: 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-500/30 dark:bg-sky-950/30 dark:text-sky-200',
  } as const

  return <div className={`rounded-[22px] border px-4 py-3 text-sm ${tones[tone]} ${className}`}>{message}</div>
}

function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[]
  onDismiss: (id: number) => void
}) {
  if (toasts.length === 0) return null

  const tones = {
    success: 'border-emerald-200/80 bg-emerald-50/95 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-950/90 dark:text-emerald-100',
    warning: 'border-amber-200/80 bg-amber-50/95 text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/90 dark:text-amber-100',
    danger: 'border-rose-200/80 bg-rose-50/95 text-rose-900 dark:border-rose-500/30 dark:bg-rose-950/90 dark:text-rose-100',
    info: 'border-sky-200/80 bg-sky-50/95 text-sky-900 dark:border-sky-500/30 dark:bg-sky-950/90 dark:text-sky-100',
  } as const

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[120] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2.5">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto rounded-2xl border px-4 py-3 shadow-lg shadow-slate-900/10 backdrop-blur ${tones[toast.tone]}`}
        >
          <div className="flex items-start gap-3">
            <div className="flex-1 text-sm font-medium">{toast.message}</div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              className="rounded-full px-2 py-0.5 text-xs font-semibold opacity-70 transition hover:opacity-100"
              aria-label="Dismiss notification"
            >
              x
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">{label}</div>
      {children}
    </label>
  )
}

function DetailsList({ items }: { items: Array<[string, React.ReactNode]> }) {
  return (
    <div className="space-y-2 text-sm">
      {items.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-3">
          <span className="text-slate-500 dark:text-slate-400">{label}</span>
          <span className="text-right font-medium text-slate-900 dark:text-slate-100">{value || '-'}</span>
        </div>
      ))}
    </div>
  )
}

function InfoTile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-[18px] border border-slate-200/70 bg-white/75 p-4 dark:border-slate-800 dark:bg-slate-950/55">
      <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">{value}</div>
      <div className="mt-2 text-sm text-slate-500 dark:text-slate-400">{hint}</div>
    </div>
  )
}

function PlanOption({
  title,
  amount,
  sub,
  onClick,
  busy,
  subscribed,
  disabled,
  ctaLabel,
  statusLabel,
}: {
  title: string
  amount: string
  sub: string
  onClick: () => void
  busy: boolean
  subscribed?: boolean
  disabled?: boolean
  ctaLabel?: string
  statusLabel?: string
}) {
  const isDisabled = Boolean(disabled || subscribed || busy)
  return (
    <div className="rounded-[18px] border border-slate-200/70 bg-white/80 p-3.5 dark:border-slate-800 dark:bg-slate-950/55">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">{title}</div>
        {statusLabel ? (
          <span
            className={`inline-flex  items-center justify-center rounded-full px-2.5 py-1 text-center text-[10px] font-semibold uppercase leading-tight tracking-[0.14em] ${
              subscribed
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200'
                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            {statusLabel}
          </span>
        ) : null}
      </div>
      <div className="mt-1.5 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">{amount}</div>
      <div className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{sub}</div>
      <button
        onClick={onClick}
        disabled={isDisabled}
        type="button"
        className={`mt-3 w-full rounded-full px-4 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60 ${
          subscribed
            ? 'bg-emerald-600 text-white hover:bg-emerald-600'
            : disabled
              ? 'bg-slate-200 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400'
              : 'bg-slate-950 text-white hover:bg-slate-800 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400'
        }`}
      >
        {busy ? 'Processing...' : ctaLabel ?? (subscribed ? 'Subscribed' : `Activate ${title}`)}
      </button>
    </div>
  )
}

const inputCls =
  'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100'
const saveBtnCls =
  'rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400'
const cancelBtnCls =
  'rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800'
const editBtnCls = 'text-xs font-semibold text-sky-600 hover:underline dark:text-sky-400'
