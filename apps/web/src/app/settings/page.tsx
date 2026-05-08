'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { Badge } from '@/components/ui/Badge'
import { Card, SectionHeader } from '@/components/ui/Card'
import { api } from '@/lib/api'
import { fmt, fmtDate } from '@/lib/utils'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useCreateStaff, useDeleteStaff, useStaff, useUpdateStaff } from '@/hooks/useStaff'
import { useLocations } from '@/hooks/useInventory'
import { useAuthStore } from '@/store/auth'
import { useI18n } from '@/lib/i18n'
import Link from 'next/link'
import {
  CUSTOM_ONBOARDING_FEATURES,
  CUSTOM_ONBOARDING_MODULES,
  listBusinessTypeOptions,
  normalizeBusinessType,
} from '@cement-house/utils'

function getCustomDependencyHints(enabledModules: string[], featureFlags: Record<string, boolean>) {
  const hints: string[] = []
  if (enabledModules.length === 0) hints.push('Select at least one core module.')
  if (enabledModules.includes('orders') && !enabledModules.includes('customers')) {
    hints.push('Billing / orders needs Customers module.')
  }
  if (featureFlags.transportManagement && !(enabledModules.includes('deliveries') || enabledModules.includes('logistics'))) {
    hints.push('Transport management needs Delivery or Logistics module.')
  }
  if (featureFlags.restaurantPOS && !(enabledModules.includes('orders') && enabledModules.includes('inventory'))) {
    hints.push('Restaurant POS needs Orders + Inventory modules.')
  }
  if (featureFlags.gstBilling && !enabledModules.includes('orders')) {
    hints.push('GST billing needs Billing / orders module.')
  }
  return hints
}

function useSettingsBootstrap() {
  return useQuery({
    queryKey: ['settings-bootstrap'],
    queryFn: () => api.get('/api/settings/bootstrap').then((r) => r.data.data),
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
type PlanName = 'FREE' | 'BASIC' | 'PRO' | 'ENTERPRISE'
type ActivePlan = {
  id: string
  name: PlanName
  priceMonthly: number
  priceYearly: number
  description: string | null
  isActive: boolean
  features: Record<string, unknown>
}
type AlertTone = 'success' | 'warning' | 'danger' | 'info'
type ToastItem = { id: number; tone: AlertTone; message: string }
type SubscriptionTimelineItem = {
  status: 'PENDING' | 'SUCCESS' | 'FAILED'
  interval: BillingInterval
  createdAt: string
  queued?: boolean
  queuedStartAt?: string | null
  queuedEndAt?: string | null
  plannedStartAt?: string | null
  plannedEndAt?: string | null
}

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
  const { data: bootstrapData, isLoading } = useSettingsBootstrap()
  const data = bootstrapData?.settings
  const plansData = bootstrapData?.plans as ActivePlan[] | undefined
  const subscriptionUsage = bootstrapData?.subscriptionUsage
  const [shouldLoadLocations, setShouldLoadLocations] = useState(false)
  const [shouldLoadStaff, setShouldLoadStaff] = useState(false)
  const locationsCardRef = useRef<HTMLDivElement | null>(null)
  const staffCardRef = useRef<HTMLDivElement | null>(null)
  const accessLocked = Boolean(data?.subscription?.accessLocked)
  const { data: locations, isLoading: locationsLoading } = useLocations({
    enabled: user?.role === 'OWNER' && !accessLocked && shouldLoadLocations,
  })

  const { data: staffList, isLoading: sLoading } = useStaff({
    enabled: user?.role === 'OWNER' && !accessLocked && shouldLoadStaff,
  })
  const createStaff = useCreateStaff()
  const updateStaff = useUpdateStaff()
  const deleteStaff = useDeleteStaff()

  const [alert, setAlert] = useState<{ tone: AlertTone; message: string } | null>(null)
  const [trialNoticeDismissed, setTrialNoticeDismissed] = useState(false)
  const [bizEdit, setBizEdit] = useState(false)
  const [bizName, setBizName] = useState('')
  const [bizCity, setBizCity] = useState('')
  const [bizAddr, setBizAddr] = useState('')
  const [bizPhone, setBizPhone] = useState('')
  const [bizGstin, setBizGstin] = useState('')
  const [bizType, setBizType] = useState<string>('GENERAL_STORE')
  const [bizTypeName, setBizTypeName] = useState('')
  const [customBizDesc, setCustomBizDesc] = useState('')
  const [labelInventory, setLabelInventory] = useState('')
  const [labelMaterial, setLabelMaterial] = useState('')
  const [labelCustomer, setLabelCustomer] = useState('')
  const [modulesEdit, setModulesEdit] = useState(false)
  const [modulesSelection, setModulesSelection] = useState<string[]>([])
  const [featureSelection, setFeatureSelection] = useState<Record<string, boolean>>({})

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
  const [selectedPlanName, setSelectedPlanName] = useState<PlanName>('PRO')
  const [isConfirmingPayment, setIsConfirmingPayment] = useState(false)
  const [logoutReason, setLogoutReason] = useState('')
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const customDependencyHints = useMemo(
    () => getCustomDependencyHints(modulesSelection, featureSelection),
    [modulesSelection, featureSelection],
  )

  const selectedPlan = useMemo(
    () => (plansData ?? []).find((plan) => plan.name === selectedPlanName) ?? null,
    [plansData, selectedPlanName]
  )
  const selectedPlanAmount = selectedInterval === 'YEARLY'
    ? fmt(Number(selectedPlan?.priceYearly ?? 0))
    : fmt(Number(selectedPlan?.priceMonthly ?? 0))
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

  const currentPlanName = (subscriptionUsage?.subscription?.plan?.name ?? null) as PlanName | null
  const paymentTimeline = useMemo<SubscriptionTimelineItem[]>(
    () => (Array.isArray((subscriptionUsage as any)?.paymentTimeline) ? (subscriptionUsage as any).paymentTimeline : []),
    [subscriptionUsage],
  )
  const pendingWebhookGraceMs = 20 * 60 * 1000
  const nextQueuedPlan = useMemo<SubscriptionTimelineItem | null>(() => {
    const now = Date.now()
    const parseMs = (value?: string | null) => {
      if (!value) return NaN
      const ms = new Date(value).getTime()
      return Number.isFinite(ms) ? ms : NaN
    }
    const currentEndMs = parseMs(data?.subscription?.endsAt ?? null)
    const activationAnchorMs = Number.isFinite(currentEndMs) ? Math.max(now, currentEndMs) : now

    const queuedSuccess = paymentTimeline.find((item) => {
      const activationStart = item.queuedStartAt ?? item.plannedStartAt ?? null
      if (!(item.status === 'SUCCESS' && item.queued && activationStart)) return false
      const startMs = parseMs(activationStart)
      return Number.isFinite(startMs) && startMs > activationAnchorMs
    })
    if (queuedSuccess) return queuedSuccess

    const freshPending = paymentTimeline.find((item) => {
      if (item.status !== 'PENDING') return false
      const activationStart = item.queuedStartAt ?? item.plannedStartAt ?? null
      const startMs = parseMs(activationStart)
      if (Number.isFinite(startMs) && startMs <= activationAnchorMs) return false
      const createdMs = parseMs(item.createdAt)
      if (!Number.isFinite(createdMs)) return false
      return now - createdMs <= pendingWebhookGraceMs
    })
    return freshPending ?? null
  }, [paymentTimeline, data?.subscription?.endsAt])
  const shouldShowPendingWebhook = useMemo(() => {
    if (!nextQueuedPlan || nextQueuedPlan.status !== 'PENDING') return false
    const now = Date.now()
    const createdMs = new Date(nextQueuedPlan.createdAt).getTime()
    return Number.isFinite(createdMs) && now - createdMs <= pendingWebhookGraceMs
  }, [nextQueuedPlan])
  const paidPlanForCheckout = useMemo(
    () =>
      (plansData ?? []).find((plan) => plan.name === 'BASIC')
      ?? (plansData ?? []).find((plan) => plan.name === 'PRO')
      ?? (plansData ?? []).find((plan) => plan.name === 'ENTERPRISE')
      ?? null,
    [plansData],
  )

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
    if (user?.role !== 'OWNER' || accessLocked) return
    const refs = [
      { ref: locationsCardRef, setLoaded: setShouldLoadLocations },
      { ref: staffCardRef, setLoaded: setShouldLoadStaff },
    ]
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          const match = refs.find((item) => item.ref.current === entry.target)
          if (!match) continue
          match.setLoaded(true)
          observer.unobserve(entry.target)
        }
      },
      { rootMargin: '200px 0px 200px 0px' },
    )
    for (const item of refs) {
      if (item.ref.current) observer.observe(item.ref.current)
    }
    return () => observer.disconnect()
  }, [user?.role, accessLocked])

  useEffect(() => {
    if (staffFormOpen) setShouldLoadStaff(true)
  }, [staffFormOpen])

  useEffect(() => {
    if (!data) return
    setBizName(data.business?.name ?? '')
    setBizCity(data.business?.city ?? '')
    setBizAddr(data.business?.address ?? '')
    setBizPhone(data.business?.phone ?? '')
    setBizGstin(data.business?.gstin ?? '')
    setBizType(normalizeBusinessType(data.business?.businessType))
    setBizTypeName(data.business?.customLabels?.businessTypeName ?? '')
    setCustomBizDesc((data.business?.defaultSettings?.customBusinessDescription as string | undefined) ?? '')
    setLabelInventory(data.business?.customLabels?.inventory ?? '')
    setLabelMaterial(data.business?.customLabels?.material ?? '')
    setLabelCustomer(data.business?.customLabels?.customer ?? '')
    setModulesSelection(
      Array.isArray(data.business?.enabledModules)
        ? data.business.enabledModules.filter((entry: unknown): entry is string => typeof entry === 'string')
        : [],
    )
    setFeatureSelection(
      data.business?.featureFlags && typeof data.business.featureFlags === 'object'
        ? (data.business.featureFlags as Record<string, boolean>)
        : {},
    )
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

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!trialBannerMessage) {
      setTrialNoticeDismissed(false)
      return
    }
    const hideUntilRaw = window.localStorage.getItem('settings_trial_notice_hide_until')
    const hideUntil = hideUntilRaw ? Number(hideUntilRaw) : 0
    setTrialNoticeDismissed(Number.isFinite(hideUntil) && hideUntil > Date.now())
  }, [trialBannerMessage])

  function hideTrialNotice(hours: number) {
    if (typeof window === 'undefined') return
    if (hours <= 0) {
      window.localStorage.removeItem('settings_trial_notice_hide_until')
      setTrialNoticeDismissed(false)
      return
    }
    const until = Date.now() + hours * 60 * 60 * 1000
    window.localStorage.setItem('settings_trial_notice_hide_until', String(until))
    setTrialNoticeDismissed(true)
  }

  const updateBiz = useMutation({
    mutationFn: (payload: any) => api.patch('/api/settings/business', payload).then((r) => r.data.data),
    onSuccess: (biz) => {
      qc.invalidateQueries({ queryKey: ['settings-bootstrap'] })
      setBizEdit(false)
      if (token && user) {
        login(token, {
          ...user,
          businessName: biz.name,
          businessCity: biz.city,
          businessType: biz.businessType ?? user.businessType ?? 'GENERAL_STORE',
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
      qc.invalidateQueries({ queryKey: ['settings-bootstrap'] })
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
      qc.invalidateQueries({ queryKey: ['settings-bootstrap'] })
      setRemEdit(false)
      setAlert({ tone: 'success', message: 'Reminder rules updated successfully.' })
    },
    onError: (error) => setAlert({ tone: 'danger', message: getAlertMessage(error, 'Failed to update reminder rules.') }),
  })

  const updateModulesConfig = useMutation({
    mutationFn: (payload: any) => api.patch('/api/settings/business/modules-config', payload).then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings-bootstrap'] })
      setModulesEdit(false)
      setAlert({ tone: 'success', message: 'Modules and features updated successfully.' })
    },
    onError: (error) =>
      setAlert({ tone: 'danger', message: getAlertMessage(error, 'Failed to update modules and features.') }),
  })

  function toggleModule(moduleKey: string) {
    setModulesSelection((prev) =>
      prev.includes(moduleKey) ? prev.filter((entry) => entry !== moduleKey) : [...prev, moduleKey],
    )
  }

  function toggleFeature(featureKey: string) {
    setFeatureSelection((prev) => ({ ...prev, [featureKey]: !prev[featureKey] }))
  }


  const cancelSubscription = useMutation({
    mutationFn: () => api.post('/api/settings/subscription/cancel', {}).then((r) => r.data.data),
    onSuccess: (result) => {
      if (result?.session?.token && result?.session?.user) {
        login(result.session.token, result.session.user)
      }
      qc.invalidateQueries({ queryKey: ['settings-bootstrap'] })
      setAlert({
        tone: 'info',
        message: result?.message ?? 'Subscription cancelled. Current cycle remains active until access end date.',
      })
    },
    onError: (error) => {
      setAlert({ tone: 'danger', message: getAlertMessage(error, 'Failed to cancel subscription.') })
    },
  })

  function openCheckout(planName: PlanName, interval: BillingInterval) {
    if (planName === 'FREE') {
      setAlert({ tone: 'info', message: 'FREE plan is managed without online payment. Contact support or use downgrade flow.' })
      return
    }
    if (currentPlanName === planName && isCurrentPlanActive(interval)) return
    setSelectedPlanName(planName)
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
          planName: selectedPlanName,
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
      qc.invalidateQueries({ queryKey: ['settings-bootstrap'] })
      setCheckoutOpen(false)
      const intervalLabel = verifiedResult.interval === 'YEARLY' ? 'yearly' : 'monthly'
      setAlert({
        tone: verifiedResult?.pendingWebhook ? 'info' : 'success',
        message: verifiedResult?.pendingWebhook
          ? `Payment received for ${intervalLabel} subscription. Waiting for webhook confirmation to activate plan.`
          : `Payment confirmed successfully. Your ${intervalLabel} subscription is active until ${fmtDate(verifiedResult.endsAt)} and the workspace is now unlocked.`,
      })
      pushToast('success', verifiedResult?.pendingWebhook ? 'Payment captured. Activation in progress.' : `Payment successful. ${intervalLabel === 'yearly' ? 'Yearly' : 'Monthly'} subscription is now active.`)
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
    return (
      <AppShell>
        <SectionHeader
          eyebrow={language === 'hi' ? 'वर्कस्पेस एडमिनिस्ट्रेशन' : 'Workspace administration'}
          title={language === 'hi' ? 'सेटिंग्स' : 'Settings'}
          description={language === 'hi' ? 'बिज़नेस प्रोफाइल, रिमाइंडर और सब्सक्रिप्शन सेटअप लोड हो रहा है।' : language === 'hinglish' ? 'Business profile, reminders aur subscription setup load ho raha hai.' : 'Loading business profile, reminders, and subscription setup.'}
        />
        <div className="max-w-6xl space-y-4">
          <Card className="rounded-[20px] p-3.5 md:rounded-[24px] md:p-5">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {language === 'hi' ? 'सब्सक्रिप्शन और रिन्यूअल' : 'Subscription & renewal'}
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <InfoTile label={language === 'hi' ? 'वर्तमान एक्सेस' : 'Current access'} value="—" hint="Loading..." />
              <InfoTile label={language === 'hi' ? 'बिलिंग साइकिल' : 'Billing cycle'} value="—" hint="Loading..." />
              <InfoTile label={language === 'hi' ? 'स्टेटस' : 'Status'} value="—" hint="Loading..." />
            </div>
          </Card>
          <Card className="rounded-[20px] p-3.5 md:rounded-[24px] md:p-5">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {language === 'hi' ? 'वर्कस्पेस प्रोफाइल' : 'Workspace profile'}
            </div>
            <div className="mt-3 space-y-2.5">
              <div className="rounded-xl border border-slate-200/80 bg-white/70 px-3 py-2 dark:border-slate-800 dark:bg-slate-950/45">
                <div className="text-[11px] uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">{language === 'hi' ? 'बिज़नेस' : 'Business'}</div>
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">—</div>
                <div className="text-xs text-slate-500">Loading...</div>
              </div>
              <div className="rounded-xl border border-slate-200/80 bg-white/70 px-3 py-2 dark:border-slate-800 dark:bg-slate-950/45">
                <div className="text-[11px] uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">{language === 'hi' ? 'प्रोफाइल' : 'Profile'}</div>
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">—</div>
                <div className="text-xs text-slate-500">Loading...</div>
              </div>
            </div>
          </Card>
        </div>
      </AppShell>
    )
  }

  const settingsCardCls = 'rounded-[20px] p-3.5 md:rounded-[24px] md:p-5'

  return (
    <AppShell>
      <SectionHeader
        eyebrow={language === 'hi' ? 'à¤µà¤°à¥à¤•à¤¸à¥à¤ªà¥‡à¤¸ à¤à¤¡à¤®à¤¿à¤¨à¤¿à¤¸à¥à¤Ÿà¥à¤°à¥‡à¤¶à¤¨' : 'Workspace administration'}
        title={language === 'hi' ? 'à¤¸à¥‡à¤Ÿà¤¿à¤‚à¤—à¥à¤¸' : 'Settings'}
        description={language === 'hi' ? 'à¤¬à¤¿à¤œà¤¼à¤¨à¥‡à¤¸ à¤ªà¥à¤°à¥‹à¤«à¤¾à¤‡à¤², à¤°à¤¿à¤®à¤¾à¤‡à¤‚à¤¡à¤°, à¤“à¤¨à¤° à¤ªà¥à¤°à¥‹à¤«à¤¾à¤‡à¤² à¤”à¤° à¤¸à¤¬à¥à¤¸à¤•à¥à¤°à¤¿à¤ªà¥à¤¶à¤¨ à¤®à¥ˆà¤¨à¥‡à¤œ à¤•à¤°à¥‡à¤‚à¥¤' : language === 'hinglish' ? 'Business profile, reminders, owner profile aur subscription manage karo.' : 'Manage business identity, reminders, owner profile, subscription access, and renewal setup.'}
      />

      {trialBannerMessage && !trialNoticeDismissed ? (
        <div className="mb-4 max-w-6xl rounded-2xl border border-amber-200/80 bg-amber-50/95 px-3 py-2.5 text-amber-900 shadow-sm dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-100">
          <div className="flex items-start justify-between gap-2">
            <div className="text-xs leading-5">{trialBannerMessage}</div>
            <button
              type="button"
              onClick={() => hideTrialNotice(24)}
              className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-amber-800 transition-colors hover:bg-amber-100 dark:text-amber-200 dark:hover:bg-amber-900/40"
              aria-label="Dismiss trial notice"
            >
              ×
            </button>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => hideTrialNotice(12)}
              className="rounded-full border border-amber-300/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-amber-800 transition-colors hover:bg-amber-100 dark:border-amber-400/40 dark:text-amber-200 dark:hover:bg-amber-900/40"
            >
              {language === 'hi' ? 'बाद में' : language === 'hinglish' ? 'Later' : 'Later'}
            </button>
            {paidPlanForCheckout ? (
              <button
                type="button"
                onClick={() => openCheckout(paidPlanForCheckout.name, 'MONTHLY')}
                className="rounded-full bg-amber-600 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-white transition-colors hover:bg-amber-700"
              >
                {language === 'hi' ? 'सब्सक्राइब करें' : language === 'hinglish' ? 'Subscribe' : 'Subscribe'}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="max-w-6xl space-y-4 pb-24 md:pb-6">
        <Card className={settingsCardCls}>
          <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('Subscription & renewal', 'à¤¸à¤¬à¥à¤¸à¤•à¥à¤°à¤¿à¤ªà¥à¤¶à¤¨ à¤”à¤° à¤°à¤¿à¤¨à¥à¤¯à¥‚à¤…à¤²')}</div>
              <div className="mt-1.5 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">
                {data?.subscription?.inTrial ? t('Free trial access', 'à¤®à¥à¤«à¥à¤¤ à¤Ÿà¥à¤°à¤¾à¤¯à¤² à¤à¤•à¥à¤¸à¥‡à¤¸') : t('Paid subscription access', 'à¤ªà¥‡à¤¡ à¤¸à¤¬à¥à¤¸à¤•à¥à¤°à¤¿à¤ªà¥à¤¶à¤¨ à¤à¤•à¥à¤¸à¥‡à¤¸')}
              </div>
              <div className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                {data?.subscription?.accessReason || t('Your workspace keeps a saved card ready for quick renewal.', 'à¤†à¤ªà¤•à¥‡ à¤µà¤°à¥à¤•à¤¸à¥à¤ªà¥‡à¤¸ à¤®à¥‡à¤‚ à¤œà¤²à¥à¤¦à¥€ à¤°à¤¿à¤¨à¥à¤¯à¥‚à¤…à¤² à¤•à¥‡ à¤²à¤¿à¤ à¤•à¤¾à¤°à¥à¤¡ à¤¸à¥‡à¤µ à¤°à¤¹à¤¤à¤¾ à¤¹à¥ˆà¥¤')}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant={accessLocked ? 'warning' : 'success'}>{data?.subscription?.status}</Badge>
              {data?.subscription?.interval ? <Badge>{data.subscription.interval}</Badge> : <Badge variant="info">TRIAL</Badge>}
              {canCancelSubscription ? (
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(t('Cancel auto-renewal for the current subscription? Access will continue until the current end date.', 'à¤•à¥à¤¯à¤¾ à¤®à¥Œà¤œà¥‚à¤¦à¤¾ à¤¸à¤¬à¥à¤¸à¤•à¥à¤°à¤¿à¤ªà¥à¤¶à¤¨ à¤•à¤¾ à¤‘à¤Ÿà¥‹-à¤°à¤¿à¤¨à¥à¤¯à¥‚à¤…à¤² à¤¬à¤‚à¤¦ à¤•à¤°à¤¨à¤¾ à¤¹à¥ˆ? à¤à¤•à¥à¤¸à¥‡à¤¸ à¤®à¥Œà¤œà¥‚à¤¦à¤¾ à¤à¤‚à¤¡ à¤¡à¥‡à¤Ÿ à¤¤à¤• à¤œà¤¾à¤°à¥€ à¤°à¤¹à¥‡à¤—à¤¾à¥¤'))) {
                      cancelSubscription.mutate()
                    }
                  }}
                  disabled={cancelSubscription.isPending}
                  className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-rose-700 hover:bg-rose-100 disabled:opacity-60 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200"
                >
                  {cancelSubscription.isPending ? t('Cancelling...', 'à¤°à¤¦à¥à¤¦ à¤•à¤¿à¤¯à¤¾ à¤œà¤¾ à¤°à¤¹à¤¾ à¤¹à¥ˆ...') : t('Cancel subscription', 'à¤¸à¤¬à¥à¤¸à¤•à¥à¤°à¤¿à¤ªà¥à¤¶à¤¨ à¤°à¤¦à¥à¤¦ à¤•à¤°à¥‡à¤‚')}
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
              label="Next activation"
              value={
                (nextQueuedPlan?.queuedStartAt ?? nextQueuedPlan?.plannedStartAt)
                  ? fmtDate((nextQueuedPlan?.queuedStartAt ?? nextQueuedPlan?.plannedStartAt) as string)
                  : shouldShowPendingWebhook
                    ? 'Pending webhook'
                    : 'No queued plan'
              }
              hint={
                (nextQueuedPlan?.queuedStartAt ?? nextQueuedPlan?.plannedStartAt) && (nextQueuedPlan?.queuedEndAt ?? nextQueuedPlan?.plannedEndAt)
                  ? `${nextQueuedPlan?.interval === 'YEARLY' ? 'Yearly' : 'Monthly'} window: ${fmtDate((nextQueuedPlan?.queuedStartAt ?? nextQueuedPlan?.plannedStartAt) as string)} -> ${fmtDate((nextQueuedPlan?.queuedEndAt ?? nextQueuedPlan?.plannedEndAt) as string)}`
                  : shouldShowPendingWebhook
                    ? `Payment captured for ${nextQueuedPlan?.interval === 'YEARLY' ? 'yearly' : 'monthly'} plan. Activation will follow after webhook.`
                    : 'Buy another plan to schedule next window'
              }
            />
            <div className="rounded-[20px] border border-slate-200/70 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/60">
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">Choose billing cycle</div>
              {paidPlanForCheckout ? (
                <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                  <PlanOption
                    title="Monthly"
                    amount={fmt(Number(paidPlanForCheckout.priceMonthly))}
                    sub={paidPlanForCheckout.description ?? '30-day access window'}
                    statusLabel={isCurrentPlanActive('MONTHLY') ? 'Current plan' : undefined}
                    onClick={() => openCheckout(paidPlanForCheckout.name, 'MONTHLY')}
                    busy={isConfirmingPayment && selectedInterval === 'MONTHLY' && selectedPlanName === paidPlanForCheckout.name}
                    subscribed={isCurrentPlanActive('MONTHLY')}
                    disabled={isCurrentPlanActive('MONTHLY')}
                    ctaLabel={isCurrentPlanActive('MONTHLY') ? 'Current plan' : 'Activate monthly'}
                  />
                  <PlanOption
                    title="Yearly"
                    amount={fmt(Number(paidPlanForCheckout.priceYearly))}
                    sub="365-day access window"
                    statusLabel={isCurrentPlanActive('YEARLY') ? 'Current plan' : 'Best value'}
                    onClick={() => openCheckout(paidPlanForCheckout.name, 'YEARLY')}
                    busy={isConfirmingPayment && selectedInterval === 'YEARLY' && selectedPlanName === paidPlanForCheckout.name}
                    subscribed={isCurrentPlanActive('YEARLY')}
                    disabled={isCurrentPlanActive('YEARLY')}
                    ctaLabel={isCurrentPlanActive('YEARLY') ? 'Current plan' : 'Activate yearly'}
                  />
                </div>
              ) : (
                <div className="mt-3 text-sm text-rose-600 dark:text-rose-300">
                  Paid plan is not configured yet. Ask admin to set Monthly/Yearly pricing.
                </div>
              )}
            </div>
          </div>
          

        </Card>

        {accessLocked ? (
          <Card className={settingsCardCls}>
            <div className="text-lg font-semibold text-slate-950 dark:text-white">{t('Workspace locked for billing', 'à¤¬à¤¿à¤²à¤¿à¤‚à¤— à¤•à¥‡ à¤•à¤¾à¤°à¤£ à¤µà¤°à¥à¤•à¤¸à¥à¤ªà¥‡à¤¸ à¤²à¥‰à¤• à¤¹à¥ˆ')}</div>
            <div className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              {t('Renew a subscription above to unlock business management, reminders, staff operations, and the rest of the workspace.', 'à¤Šà¤ªà¤° à¤¸à¥‡ à¤¸à¤¬à¥à¤¸à¤•à¥à¤°à¤¿à¤ªà¥à¤¶à¤¨ à¤°à¤¿à¤¨à¥à¤¯à¥‚ à¤•à¤°à¥‡à¤‚ à¤¤à¤¾à¤•à¤¿ à¤¬à¤¿à¤œà¤¼à¤¨à¥‡à¤¸ à¤®à¥ˆà¤¨à¥‡à¤œà¤®à¥‡à¤‚à¤Ÿ, à¤°à¤¿à¤®à¤¾à¤‡à¤‚à¤¡à¤°, à¤¸à¥à¤Ÿà¤¾à¤« à¤‘à¤ªà¤°à¥‡à¤¶à¤¨ à¤”à¤° à¤¬à¤¾à¤•à¥€ à¤µà¤°à¥à¤•à¤¸à¥à¤ªà¥‡à¤¸ à¤…à¤¨à¤²à¥‰à¤• à¤¹à¥‹ à¤œà¤¾à¤à¥¤')}
            </div>
          </Card>
        ) : (
          <>
            <div className="grid items-start gap-4 xl:grid-cols-2">
              <Card className={settingsCardCls}>
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('Business info', 'à¤¬à¤¿à¤œà¤¼à¤¨à¥‡à¤¸ à¤œà¤¾à¤¨à¤•à¤¾à¤°à¥€')}</div>
                  {!bizEdit && user?.role === 'OWNER' ? <button onClick={() => setBizEdit(true)} className={editBtnCls}>{t('Edit', 'à¤¸à¤‚à¤ªà¤¾à¤¦à¤¿à¤¤ à¤•à¤°à¥‡à¤‚')}</button> : null}
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
                        <select value={bizType} onChange={(e) => setBizType(e.target.value)} className={inputCls}>
                          {listBusinessTypeOptions().map((option) => (
                            <option key={option.type} value={option.type}>{option.label}</option>
                          ))}
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
                      <button type="submit" disabled={updateBiz.isPending} className={saveBtnCls}>{updateBiz.isPending ? t('Saving...', 'à¤¸à¥‡à¤µ à¤¹à¥‹ à¤°à¤¹à¤¾ à¤¹à¥ˆ...') : t('Save changes', 'à¤¬à¤¦à¤²à¤¾à¤µ à¤¸à¥‡à¤µ à¤•à¤°à¥‡à¤‚')}</button>
                      <button type="button" onClick={() => setBizEdit(false)} className={cancelBtnCls}>{t('Cancel', 'à¤°à¤¦à¥à¤¦ à¤•à¤°à¥‡à¤‚')}</button>
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
                      ['Business type', data?.business?.businessType === 'CUSTOM' ? (data?.business?.customLabels?.businessTypeName ?? 'Custom') : (data?.business?.businessType ?? 'GENERAL_STORE')],
                      ['Inventory label', data?.business?.customLabels?.inventory ?? 'Inventory'],
                      ['Material label', data?.business?.customLabels?.material ?? 'Material'],
                      ['Customer label', data?.business?.customLabels?.customer ?? 'Customer'],
                    ]}
                  />
                )}
              </Card>

              <Card className={settingsCardCls}>
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('Your profile', 'à¤†à¤ªà¤•à¥€ à¤ªà¥à¤°à¥‹à¤«à¤¾à¤‡à¤²')}</div>
                  {!profEdit ? <button onClick={() => setProfEdit(true)} className={editBtnCls}>{t('Edit', 'à¤¸à¤‚à¤ªà¤¾à¤¦à¤¿à¤¤ à¤•à¤°à¥‡à¤‚')}</button> : null}
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
                      <button type="submit" disabled={updateProf.isPending} className={saveBtnCls}>{updateProf.isPending ? t('Saving...', 'à¤¸à¥‡à¤µ à¤¹à¥‹ à¤°à¤¹à¤¾ à¤¹à¥ˆ...') : t('Save profile', 'à¤ªà¥à¤°à¥‹à¤«à¤¾à¤‡à¤² à¤¸à¥‡à¤µ à¤•à¤°à¥‡à¤‚')}</button>
                      <button type="button" onClick={() => setProfEdit(false)} className={cancelBtnCls}>{t('Cancel', 'à¤°à¤¦à¥à¤¦ à¤•à¤°à¥‡à¤‚')}</button>
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

            {bizType === 'CUSTOM' && user?.role === 'OWNER' ? (
              <Card className={settingsCardCls}>
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {t('Modules & features', 'à¤®à¥‰à¤¡à¥à¤¯à¥‚à¤² à¤”à¤° à¤«à¥€à¤šà¤°à¥à¤¸')}
                  </div>
                  {!modulesEdit ? (
                    <button onClick={() => setModulesEdit(true)} className={editBtnCls}>
                      {t('Edit', 'à¤¸à¤‚à¤ªà¤¾à¤¦à¤¿à¤¤ à¤•à¤°à¥‡à¤‚')}
                    </button>
                  ) : null}
                </div>

                {modulesEdit ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault()
                      if (modulesSelection.length === 0) {
                        setAlert({ tone: 'danger', message: 'Select at least one core module.' })
                        return
                      }
                      if (modulesSelection.includes('orders') && !modulesSelection.includes('customers')) {
                        setAlert({
                          tone: 'danger',
                          message: 'Customers module is required when billing/orders is enabled.',
                        })
                        return
                      }
                      if (
                        featureSelection.transportManagement &&
                        !(modulesSelection.includes('deliveries') || modulesSelection.includes('logistics'))
                      ) {
                        setAlert({
                          tone: 'danger',
                          message: 'Enable delivery/transport module for transport management.',
                        })
                        return
                      }
                      if (
                        featureSelection.restaurantPOS &&
                        !(modulesSelection.includes('orders') && modulesSelection.includes('inventory'))
                      ) {
                        setAlert({
                          tone: 'danger',
                          message: 'Restaurant POS requires orders and inventory modules.',
                        })
                        return
                      }
                      if (featureSelection.gstBilling && !modulesSelection.includes('orders')) {
                        setAlert({ tone: 'danger', message: 'GST billing requires billing/orders module.' })
                        return
                      }

                      updateModulesConfig.mutate({
                        customBusinessTypeName: bizTypeName || undefined,
                        customBusinessDescription: customBizDesc || undefined,
                        enabledModules: modulesSelection,
                        featureFlags: featureSelection,
                      })
                    }}
                    className="space-y-3"
                  >
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <Field label="Custom business type"><input value={bizTypeName} onChange={(e) => setBizTypeName(e.target.value)} className={inputCls} /></Field>
                      <Field label="Description"><input value={customBizDesc} onChange={(e) => setCustomBizDesc(e.target.value)} className={inputCls} /></Field>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-2xl border border-slate-200/70 p-3 dark:border-slate-800">
                        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Modules</div>
                        <div className="grid gap-2">
                          {CUSTOM_ONBOARDING_MODULES.map((module) => (
                            <label key={module.key} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                              <input
                                type="checkbox"
                                checked={modulesSelection.includes(module.key)}
                                onChange={() => toggleModule(module.key)}
                              />
                              <span>{module.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-slate-200/70 p-3 dark:border-slate-800">
                        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Features</div>
                        <div className="grid gap-2">
                          {CUSTOM_ONBOARDING_FEATURES.map((feature) => (
                            <label key={feature.key} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                              <input
                                type="checkbox"
                                checked={Boolean(featureSelection[feature.key])}
                                onChange={() => toggleFeature(feature.key)}
                              />
                              <span>{feature.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                    {customDependencyHints.length > 0 ? (
                      <div className="rounded-xl border border-amber-300/60 bg-amber-50/90 p-3 text-xs text-amber-800 dark:border-amber-400/30 dark:bg-amber-950/25 dark:text-amber-200">
                        {customDependencyHints.map((hint) => (
                          <div key={hint}>â€¢ {hint}</div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-emerald-300/60 bg-emerald-50/90 p-3 text-xs text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-950/25 dark:text-emerald-200">
                        â€¢ Setup looks good.
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button type="submit" disabled={updateModulesConfig.isPending} className={saveBtnCls}>
                        {updateModulesConfig.isPending ? t('Saving...', 'à¤¸à¥‡à¤µ à¤¹à¥‹ à¤°à¤¹à¤¾ à¤¹à¥ˆ...') : t('Save modules', 'à¤®à¥‰à¤¡à¥à¤¯à¥‚à¤² à¤¸à¥‡à¤µ à¤•à¤°à¥‡à¤‚')}
                      </button>
                      <button type="button" onClick={() => setModulesEdit(false)} className={cancelBtnCls}>
                        {t('Cancel', 'à¤°à¤¦à¥à¤¦ à¤•à¤°à¥‡à¤‚')}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
                    <div>
                      <span className="font-medium text-slate-900 dark:text-white">Modules:</span>{' '}
                      {modulesSelection.length > 0 ? modulesSelection.join(', ') : '-'}
                    </div>
                    <div>
                      <span className="font-medium text-slate-900 dark:text-white">Enabled features:</span>{' '}
                      {Object.entries(featureSelection)
                        .filter(([, enabled]) => enabled)
                        .map(([key]) => key)
                        .join(', ') || '-'}
                    </div>
                  </div>
                )}
              </Card>
            ) : null}

            <div className="grid items-start gap-4 xl:grid-cols-2">
              <div ref={locationsCardRef}>
              <Card className={settingsCardCls}>
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('Locations', 'à¤²à¥‹à¤•à¥‡à¤¶à¤¨à¥à¤¸')}</div>
                  <Link href="/settings/locations" className={editBtnCls}>{t('Manage', 'à¤®à¥ˆà¤¨à¥‡à¤œ à¤•à¤°à¥‡à¤‚')}</Link>
                </div>
                {!shouldLoadLocations ? (
                  <div className="text-sm text-slate-500 dark:text-slate-400">Scroll to load locations snapshot...</div>
                ) : locationsLoading ? (
                  <div className="text-sm text-slate-500 dark:text-slate-400">{t('Loading...', 'à¤²à¥‹à¤¡ à¤¹à¥‹ à¤°à¤¹à¤¾ à¤¹à¥ˆ...')}</div>
                ) : (
                  <DetailsList
                    items={[
                      [t('Total locations', 'à¤•à¥à¤² à¤²à¥‹à¤•à¥‡à¤¶à¤¨à¥à¤¸'), String((locations ?? []).length)],
                      [t('Active locations', 'à¤¸à¤•à¥à¤°à¤¿à¤¯ à¤²à¥‹à¤•à¥‡à¤¶à¤¨à¥à¤¸'), String((locations ?? []).filter((loc: any) => loc.isActive).length)],
                      [t('Default location', 'à¤¡à¤¿à¤«à¤¼à¥‰à¤²à¥à¤Ÿ à¤²à¥‹à¤•à¥‡à¤¶à¤¨'), (locations ?? []).find((loc: any) => loc.isDefault)?.name ?? t('Not set', 'à¤¸à¥‡à¤Ÿ à¤¨à¤¹à¥€à¤‚')],
                    ]}
                  />
                )}
              </Card>
              </div>

              <Card className={settingsCardCls}>
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('Security', 'à¤¸à¤¿à¤•à¥à¤¯à¥‹à¤°à¤¿à¤Ÿà¥€')}</div>
                  {!showPw ? <button onClick={() => setShowPw(true)} className={editBtnCls}>{t('Change password', 'à¤ªà¤¾à¤¸à¤µà¤°à¥à¤¡ à¤¬à¤¦à¤²à¥‡à¤‚')}</button> : null}
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
                      <button type="submit" disabled={changePw.isPending} className={saveBtnCls}>{changePw.isPending ? t('Changing...', 'à¤¬à¤¦à¤²à¤¾ à¤œà¤¾ à¤°à¤¹à¤¾ à¤¹à¥ˆ...') : t('Change password', 'à¤ªà¤¾à¤¸à¤µà¤°à¥à¤¡ à¤¬à¤¦à¤²à¥‡à¤‚')}</button>
                      <button type="button" onClick={() => setShowPw(false)} className={cancelBtnCls}>{t('Cancel', 'à¤°à¤¦à¥à¤¦ à¤•à¤°à¥‡à¤‚')}</button>
                    </div>
                  </form>
                ) : (
                  <div className="text-sm text-slate-500 dark:text-slate-400">{t('Update your password to keep owner access secure.', 'à¤“à¤¨à¤° à¤à¤•à¥à¤¸à¥‡à¤¸ à¤¸à¥à¤°à¤•à¥à¤·à¤¿à¤¤ à¤°à¤–à¤¨à¥‡ à¤•à¥‡ à¤²à¤¿à¤ à¤ªà¤¾à¤¸à¤µà¤°à¥à¤¡ à¤…à¤ªà¤¡à¥‡à¤Ÿ à¤•à¤°à¥‡à¤‚à¥¤')}</div>
                )}
              </Card>

              <Card className={settingsCardCls}>
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('Reminder rules', 'à¤°à¤¿à¤®à¤¾à¤‡à¤‚à¤¡à¤° à¤¨à¤¿à¤¯à¤®')}</div>
                  {!remEdit ? <button onClick={() => setRemEdit(true)} className={editBtnCls}>{t('Edit', 'à¤¸à¤‚à¤ªà¤¾à¤¦à¤¿à¤¤ à¤•à¤°à¥‡à¤‚')}</button> : null}
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
                      {t('Enable automated payment reminders', 'à¤‘à¤Ÿà¥‹à¤®à¥‡à¤Ÿà¥‡à¤¡ à¤ªà¥‡à¤®à¥‡à¤‚à¤Ÿ à¤°à¤¿à¤®à¤¾à¤‡à¤‚à¤¡à¤° à¤¸à¤•à¥à¤·à¤® à¤•à¤°à¥‡à¤‚')}
                    </label>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <Field label="Soft"><input type="number" value={remSoft} onChange={(e) => setRemSoft(Number(e.target.value))} className={inputCls} /></Field>
                      <Field label="Follow-up"><input type="number" value={remFollow} onChange={(e) => setRemFollow(Number(e.target.value))} className={inputCls} /></Field>
                      <Field label="Firm"><input type="number" value={remFirm} onChange={(e) => setRemFirm(Number(e.target.value))} className={inputCls} /></Field>
                    </div>
                    <div className="flex gap-2">
                      <button type="submit" disabled={updateRem.isPending} className={saveBtnCls}>{updateRem.isPending ? t('Saving...', 'à¤¸à¥‡à¤µ à¤¹à¥‹ à¤°à¤¹à¤¾ à¤¹à¥ˆ...') : t('Save rules', 'à¤¨à¤¿à¤¯à¤® à¤¸à¥‡à¤µ à¤•à¤°à¥‡à¤‚')}</button>
                      <button type="button" onClick={() => setRemEdit(false)} className={cancelBtnCls}>{t('Cancel', 'à¤°à¤¦à¥à¤¦ à¤•à¤°à¥‡à¤‚')}</button>
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
              <div ref={staffCardRef}>
              <Card className={settingsCardCls}>
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('Staff / Munim settings', 'à¤¸à¥à¤Ÿà¤¾à¤« / à¤®à¥à¤¨à¥€à¤® à¤¸à¥‡à¤Ÿà¤¿à¤‚à¤—à¥à¤¸')}</div>
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
                      {t('+ Add Munim', '+ à¤®à¥à¤¨à¥€à¤® à¤œà¥‹à¤¡à¤¼à¥‡à¤‚')}
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
                      <div className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">{t('Permissions', 'à¤…à¤¨à¥à¤®à¤¤à¤¿à¤¯à¤¾à¤‚')}</div>
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
                        {createStaff.isPending || updateStaff.isPending ? t('Saving...', 'à¤¸à¥‡à¤µ à¤¹à¥‹ à¤°à¤¹à¤¾ à¤¹à¥ˆ...') : t('Save staff', 'à¤¸à¥à¤Ÿà¤¾à¤« à¤¸à¥‡à¤µ à¤•à¤°à¥‡à¤‚')}
                      </button>
                      <button type="button" onClick={() => setStaffFormOpen(false)} className={cancelBtnCls}>{t('Cancel', 'à¤°à¤¦à¥à¤¦ à¤•à¤°à¥‡à¤‚')}</button>
                    </div>
                  </form>
                ) : null}

                <div className="space-y-3">
                  {!shouldLoadStaff ? <div className="text-sm text-slate-500">Scroll to load staff list...</div> : null}
                  {shouldLoadStaff && sLoading ? <div className="text-sm text-slate-500">{t('Loading staff...', 'à¤¸à¥à¤Ÿà¤¾à¤« à¤²à¥‹à¤¡ à¤¹à¥‹ à¤°à¤¹à¤¾ à¤¹à¥ˆ...')}</div> : null}
                  {(staffList ?? []).filter((member: any) => member.isActive).length > 0 ? (
                    <>
                    <div className="space-y-2.5 md:hidden">
                      {(staffList ?? []).filter((member: any) => member.isActive).map((member: any) => (
                        <div key={member.id} className="rounded-2xl border border-slate-200/80 bg-white/85 p-3.5 shadow-sm dark:border-slate-800 dark:bg-slate-950/60">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{member.name}</div>
                              <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{member.phone}</div>
                              <div className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{member.email || '-'}</div>
                            </div>
                            <div className="flex shrink-0 items-center gap-3 text-xs">
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
                                className="font-medium text-rose-600"
                                type="button"
                              >
                                {t('Remove', 'à¤¹à¤Ÿà¤¾à¤à¤‚')}
                              </button>
                            </div>
                          </div>
                          <div className="mt-3 rounded-xl border border-slate-200/80 bg-slate-50/80 px-3 py-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900/65 dark:text-slate-300">
                            <span className="font-medium text-slate-700 dark:text-slate-200">{t('Permissions', 'à¤…à¤¨à¥à¤®à¤¤à¤¿à¤¯à¤¾à¤‚')}:</span>{' '}
                            {member.permissions?.length > 0 ? member.permissions.join(', ') : 'No permissions'}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="hidden overflow-x-auto rounded-[18px] border border-slate-200/70 md:block dark:border-slate-800">
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
                                    {t('Remove', 'à¤¹à¤Ÿà¤¾à¤à¤‚')}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    </>
                  ) : null}
                  {(staffList ?? []).filter((member: any) => member.isActive).length === 0 && !staffFormOpen ? (
                    <div className="text-sm text-slate-500 dark:text-slate-400">{t('No munim accounts added yet.', 'à¤…à¤­à¥€ à¤•à¥‹à¤ˆ à¤®à¥à¤¨à¥€à¤® à¤…à¤•à¤¾à¤‰à¤‚à¤Ÿ à¤¨à¤¹à¥€à¤‚ à¤œà¥‹à¤¡à¤¼à¤¾ à¤—à¤¯à¤¾à¥¤')}</div>
                  ) : null}
                </div>
              </Card>
              </div>
            ) : null}
          </>
        )}
      </div>

      {checkoutOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-[30px] border border-white/60 bg-white p-6 shadow-[0_30px_90px_rgba(15,23,42,0.22)] dark:border-white/10 dark:bg-slate-950">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-500 dark:text-slate-400">{t('Confirm subscription', 'à¤¸à¤¬à¥à¤¸à¤•à¥à¤°à¤¿à¤ªà¥à¤¶à¤¨ à¤ªà¥à¤·à¥à¤Ÿà¤¿')}</div>
                <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">
                  {selectedInterval === 'YEARLY' ? t('Activate yearly plan', 'à¤ˆà¤¯à¤°à¤²à¥€ à¤ªà¥à¤²à¤¾à¤¨ à¤¸à¤•à¥à¤°à¤¿à¤¯ à¤•à¤°à¥‡à¤‚') : t('Activate monthly plan', 'à¤®à¤‚à¤¥à¤²à¥€ à¤ªà¥à¤²à¤¾à¤¨ à¤¸à¤•à¥à¤°à¤¿à¤¯ à¤•à¤°à¥‡à¤‚')}
                </div>
                <div className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                  {t('Confirm to open Razorpay secure checkout and complete payment with your preferred method.', 'Razorpay secure checkout à¤–à¥‹à¤²à¤¨à¥‡ à¤”à¤° à¤…à¤ªà¤¨à¥€ à¤ªà¤¸à¤‚à¤¦ à¤¸à¥‡ à¤­à¥à¤—à¤¤à¤¾à¤¨ à¤ªà¥‚à¤°à¤¾ à¤•à¤°à¤¨à¥‡ à¤•à¥‡ à¤²à¤¿à¤ à¤ªà¥à¤·à¥à¤Ÿà¤¿ à¤•à¤°à¥‡à¤‚à¥¤')}
                </div>
                <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  {selectedPlanName} Â· {selectedInterval}
                </div>
              </div>
              <button type="button" onClick={() => setCheckoutOpen(false)} className={cancelBtnCls}>
                {t('Close', 'à¤¬à¤‚à¤¦ à¤•à¤°à¥‡à¤‚')}
              </button>
            </div>

            <div className="mt-5 grid gap-4">
              <div className="rounded-[24px] border border-slate-200/70 bg-slate-50/80 p-5 dark:border-slate-800 dark:bg-slate-900/60">
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">{t('Payment summary', 'à¤­à¥à¤—à¤¤à¤¾à¤¨ à¤¸à¤¾à¤°à¤¾à¤‚à¤¶')}</div>
                <div className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">{selectedPlanAmount}</div>
                <div className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                  {selectedInterval === 'YEARLY' ? t('365-day access window', '365 à¤¦à¤¿à¤¨ à¤•à¤¾ à¤à¤•à¥à¤¸à¥‡à¤¸') : t('30-day access window', '30 à¤¦à¤¿à¤¨ à¤•à¤¾ à¤à¤•à¥à¤¸à¥‡à¤¸')}
                </div>
              </div>

              <div className="rounded-[24px] border border-slate-200/70 bg-white/90 p-5 dark:border-slate-800 dark:bg-slate-950/65">
                <div className="text-sm font-semibold text-slate-950 dark:text-white">{t('Pay with Razorpay', 'Razorpay à¤¸à¥‡ à¤­à¥à¤—à¤¤à¤¾à¤¨ à¤•à¤°à¥‡à¤‚')}</div>
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {t('After confirmation, Razorpay opens secure checkout where users can choose card, UPI, netbanking, wallet, or supported methods.', 'à¤ªà¥à¤·à¥à¤Ÿà¤¿ à¤•à¥‡ à¤¬à¤¾à¤¦ Razorpay à¤•à¤¾ secure checkout à¤–à¥à¤²à¥‡à¤—à¤¾ à¤œà¤¹à¤¾à¤‚ card, UPI, netbanking, wallet à¤†à¤¦à¤¿ à¤šà¥à¤¨à¥‡ à¤œà¤¾ à¤¸à¤•à¤¤à¥‡ à¤¹à¥ˆà¤‚à¥¤')}
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => setCheckoutOpen(false)} className={cancelBtnCls}>
                  {t('Cancel', 'à¤°à¤¦à¥à¤¦ à¤•à¤°à¥‡à¤‚')}
                </button>
                  <button
                    type="button"
                    onClick={handleCheckoutConfirm}
                    disabled={isConfirmingPayment}
                    className={saveBtnCls}
                  >
                  {isConfirmingPayment ? t('Opening Razorpay...', 'Razorpay à¤–à¥à¤² à¤°à¤¹à¤¾ à¤¹à¥ˆ...') : t('Continue to Razorpay', 'Razorpay à¤ªà¤° à¤œà¤¾à¤°à¥€ à¤°à¤–à¥‡à¤‚')}
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
      <div className="mb-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-400">{label}</div>
      {children}
    </label>
  )
}

function DetailsList({ items }: { items: Array<[string, React.ReactNode]> }) {
  return (
    <div className="space-y-2.5 text-sm">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-xl border border-slate-200/80 bg-white/70 px-3 py-2 dark:border-slate-800 dark:bg-slate-950/45 md:rounded-none md:border-0 md:bg-transparent md:px-0 md:py-0">
          <div className="flex flex-col gap-0.5 md:flex-row md:items-center md:justify-between md:gap-3">
            <span className="text-[11px] uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400 md:text-sm md:normal-case md:tracking-normal">{label}</span>
            <span className="text-left text-sm font-semibold text-slate-900 dark:text-slate-100 md:text-right md:font-medium">{value || '-'}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function InfoTile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-[16px] border border-slate-200/70 bg-white/80 p-3.5 dark:border-slate-800 dark:bg-slate-950/55 md:rounded-[18px] md:p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-1.5 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">{value}</div>
      <div className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 md:text-sm">{hint}</div>
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
    <div className="rounded-[16px] border border-slate-200/70 bg-white/85 p-3.5 dark:border-slate-800 dark:bg-slate-950/55 md:rounded-[18px]">
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
      <div className="mt-1.5 text-[28px] font-semibold tracking-tight text-slate-950 dark:text-white md:text-2xl">{amount}</div>
      <div className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{sub}</div>
      <button
        onClick={onClick}
        disabled={isDisabled}
        type="button"
        className={`mt-3 w-full rounded-full px-4 py-2 text-xs font-semibold transition-colors disabled:opacity-60 ${
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
  'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 md:rounded-2xl md:px-4 md:py-3'
const saveBtnCls =
  'rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400'
const cancelBtnCls =
  'rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800'
const editBtnCls = 'text-xs font-semibold text-sky-600 hover:underline dark:text-sky-400'
