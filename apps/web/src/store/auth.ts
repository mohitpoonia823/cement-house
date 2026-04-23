import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AuthUser {
  id: string
  name: string
  role: 'OWNER' | 'MUNIM'
  businessId: string
  businessName: string
  businessCity: string
  permissions?: string[]
}

interface AuthState {
  user:    AuthUser | null
  token:   string | null
  isOwner: boolean
  login:   (token: string, user: AuthUser) => void
  logout:  () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user:    null,
      token:   null,
      isOwner: false,
      login: (token, user) => {
        localStorage.setItem('auth_token', token)
        set({ token, user, isOwner: user.role === 'OWNER' })
      },
      logout: () => {
        localStorage.removeItem('auth_token')
        set({ token: null, user: null, isOwner: false })
      },
    }),
    { name: 'cement-house-auth', partialize: (s) => ({ user: s.user, token: s.token }) }
  )
)
