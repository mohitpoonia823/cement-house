'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { SectionHeader } from '@/components/ui/Card'
import { SupportTicketsBoard } from '@/components/support/SupportTicketsBoard'
import { PageLoader } from '@/components/ui/Spinner'

export default function TicketsPage() {
  return (
    <Suspense fallback={<AppShell><PageLoader /></AppShell>}>
      <TicketsContent />
    </Suspense>
  )
}

function TicketsContent() {
  const searchParams = useSearchParams()
  const ticketId = searchParams.get('ticketId')

  return (
    <AppShell>
      <SectionHeader
        eyebrow="Support desk"
        title="Tickets"
        description="Raise queries to admin and track replies in one conversation thread."
      />
      <SupportTicketsBoard preselectedTicketId={ticketId} />
    </AppShell>
  )
}
