'use client'
import { AppShell } from '@/components/layout/AppShell'
import { NewOrderForm } from '@/components/orders/NewOrderForm'

export default function NewOrderPage() {
  return (
    <AppShell>
      <NewOrderForm />
    </AppShell>
  )
}
