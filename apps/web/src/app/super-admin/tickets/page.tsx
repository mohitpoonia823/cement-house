'use client'

import { useSearchParams } from 'next/navigation'
import { SuperAdminShell } from '@/components/layout/SuperAdminShell'
import { SectionHeader } from '@/components/ui/Card'
import { SupportTicketsBoard } from '@/components/support/SupportTicketsBoard'

export default function SuperAdminTicketsPage() {
  const searchParams = useSearchParams()
  const ticketId = searchParams.get('ticketId')

  return (
    <SuperAdminShell>
      <SectionHeader
        eyebrow="Support operations"
        title="Tickets"
        description="Review incoming owner and munim queries, reply, and mark tickets resolved."
      />
      <SupportTicketsBoard isSuperAdmin preselectedTicketId={ticketId} />
    </SuperAdminShell>
  )
}

