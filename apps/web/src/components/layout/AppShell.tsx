'use client'
import { useAuthStore } from '@/store/auth'
import { useRouter }    from 'next/navigation'
import { useEffect, useState } from 'react'
import { Sidebar }      from './Sidebar'
import { Topbar }       from './Topbar'

export function AppShell({ children }: { children: React.ReactNode }) {
  const { token } = useAuthStore()
  const router    = useRouter()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (mounted && !token) router.replace('/auth/login')
  }, [mounted, token, router])

  if (!mounted || !token) return null

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-y-auto p-5 bg-stone-50 dark:bg-stone-950">
          {children}
        </main>
      </div>
    </div>
  )
}
