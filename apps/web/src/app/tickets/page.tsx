'use client'

import { useSearchParams } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { SectionHeader } from '@/components/ui/Card'
import { SupportTicketsBoard } from '@/components/support/SupportTicketsBoard'

export default function TicketsPage() {
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

