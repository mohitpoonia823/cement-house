import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AuthUser {
  id: string
  name: string
  role: 'SUPER_ADMIN' | 'OWNER' | 'MUNIM'
  businessId: string | null
  businessName: string | null
  businessCity: string | null
  businessType?: 'GENERAL' | 'CEMENT' | 'HARDWARE_SANITARY' | 'KIRYANA' | 'CUSTOM' | null
  customLabels?: {
    businessTypeName?: string
    inventory?: string
    material?: string
    customer?: string
    supplier?: string
  } | null
  permissions?: string[]
  subscriptionStatus?: 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'SUSPENDED' | null
  subscriptionEndsAt?: string | null
  subscriptionInterval?: 'MONTHLY' | 'YEARLY' | null
  monthlySubscriptionAmount?: number
  yearlySubscriptionAmount?: number
  trialStartedAt?: string | null
  trialDaysOverride?: number | null
  accessLocked?: boolean
  accessReason?: string | null
}

interface StoredSession {
  token: string
  user: AuthUser
}

interface AuthState {
  user:    AuthUser | null
  token:   string | null
  isOwner: boolean
  isSuperAdmin: boolean
  originalAdminSession: StoredSession | null
  login:   (token: string, user: AuthUser) => void
  startImpersonation: (token: string, user: AuthUser) => void
  restoreAdminSession: () => void
  logout:  () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user:    null,
      token:   null,
      isOwner: false,
      isSuperAdmin: false,
      originalAdminSession: null,
      login: (token, user) => {
        localStorage.setItem('auth_token', token)
        set({
          token,
          user,
          isOwner: user.role === 'OWNER',
          isSuperAdmin: user.role === 'SUPER_ADMIN',
        })
      },
      startImpersonation: (token, user) => {
        const current = get()
        if (current.token && current.user && current.user.role === 'SUPER_ADMIN') {
          set({
            originalAdminSession: {
              token: current.token,
              user: current.user,
            },
          })
        }
        localStorage.setItem('auth_token', token)
        set({
          token,
          user,
          isOwner: user.role === 'OWNER',
          isSuperAdmin: user.role === 'SUPER_ADMIN',
        })
      },
      restoreAdminSession: () => {
        const original = get().originalAdminSession
        if (!original) return
        localStorage.setItem('auth_token', original.token)
        set({
          token: original.token,
          user: original.user,
          isOwner: original.user.role === 'OWNER',
          isSuperAdmin: original.user.role === 'SUPER_ADMIN',
          originalAdminSession: null,
        })
      },
      logout: () => {
        localStorage.removeItem('auth_token')
        set({ token: null, user: null, isOwner: false, isSuperAdmin: false, originalAdminSession: null })
      },
    }),
    {
      name: 'cement-house-auth',
      partialize: (s) => ({
        user: s.user,
        token: s.token,
        originalAdminSession: s.originalAdminSession,
      }),
      merge: (persistedState, currentState) => {
        const next = { ...currentState, ...(persistedState as Partial<AuthState>) }
        return {
          ...next,
          isOwner: next.user?.role === 'OWNER',
          isSuperAdmin: next.user?.role === 'SUPER_ADMIN',
        }
      },
    }
  )
)
