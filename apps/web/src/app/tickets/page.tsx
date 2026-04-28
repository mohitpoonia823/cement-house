'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { SectionHeader } from '@/components/ui/Card'
import { SupportTicketsBoard } from '@/components/support/SupportTicketsBoard'
import { PageLoader } from '@/components/ui/Spinner'
import { useI18n } from '@/lib/i18n'

export default function TicketsPage() {
  return (
    <Suspense fallback={<AppShell><PageLoader /></AppShell>}>
      <TicketsContent />
    </Suspense>
  )
}

function TicketsContent() {
  const { language } = useI18n()
  const searchParams = useSearchParams()
  const ticketId = searchParams.get('ticketId')

  return (
    <AppShell>
      <SectionHeader
        eyebrow={language === 'hi' ? 'सपोर्ट डेस्क' : 'Support desk'}
        title={language === 'hi' ? 'टिकट्स' : 'Tickets'}
        description={language === 'hi' ? 'एडमिन को सवाल भेजें और जवाब एक ही थ्रेड में ट्रैक करें।' : language === 'hinglish' ? 'Admin ko query bhejo aur replies ek hi thread me track karo.' : 'Raise queries to admin and track replies in one conversation thread.'}
      />
      <SupportTicketsBoard preselectedTicketId={ticketId} />
    </AppShell>
  )
}
