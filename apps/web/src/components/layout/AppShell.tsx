'use client'
import { useAuthStore } from '@/store/auth'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

export function AppShell({ children }: { children: React.ReactNode }) {
  const { token, user, originalAdminSession, restoreAdminSession, logout } = useAuthStore()
  const router = useRouter()
  const pathname = usePathname()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (mounted && !token) router.replace('/auth/login')
  }, [mounted, token, router])

  useEffect(() => {
    if (mounted && user?.role === 'SUPER_ADMIN') router.replace('/super-admin')
  }, [mounted, user?.role, router])

  useEffect(() => {
    if (!mounted || !token || user?.role === 'SUPER_ADMIN') return
    if (user?.accessLocked) {
      if (user.role !== 'OWNER') {
        sessionStorage.setItem('auth_logout_reason', user.accessReason ?? 'Workspace access is locked until the owner renews the subscription.')
        logout()
        router.replace('/auth/login')
        return
      }
      if (pathname !== '/settings') {
        router.replace('/settings?subscription=required')
      }
      return
    }
  }, [mounted, pathname, router, token, user?.accessLocked, user?.role])

  if (!mounted || !token || user?.role === 'SUPER_ADMIN') return null

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        {originalAdminSession && (
          <div className="px-4 pb-1 md:px-6">
            <div className="rounded-[24px] border border-amber-200/80 bg-amber-50/90 px-4 py-3 text-sm text-amber-900 shadow-sm dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-100">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  You are in secure impersonation mode as <span className="font-semibold">{user?.name}</span> for {user?.businessName}.
                </div>
                <button
                  onClick={() => {
                    restoreAdminSession()
                    router.replace('/super-admin')
                  }}
                  className="rounded-full bg-amber-900 px-4 py-2 text-xs font-semibold text-white dark:bg-amber-300 dark:text-amber-950"
                >
                  Return to Super Admin
                </button>
              </div>
            </div>
          </div>
        )}
        <main className="flex-1 px-4 pb-6 md:px-6">{children}</main>
      </div>
    </div>
  )
}
