'use client'

import { useQuery } from '@tanstack/react-query'
import { api } from './api'

export type TicketStatus = 'OPEN' | 'RESOLVED'
export type SenderRole = 'ADMIN' | 'BUSINESS'

export interface SupportTicket {
  id: string
  businessId: string
  businessName: string
  createdByUserId: string
  createdByName: string
  subject: string
  status: TicketStatus
  lastMessagePreview: string | null
  lastMessageAt: string
  createdAt: string
  updatedAt: string
  unread: boolean
}

export interface SupportMessage {
  id: string
  ticketId: string
  senderUserId: string
  senderName: string
  senderRole: SenderRole
  message: string
  createdAt: string
}

export interface SupportNotification {
  id: string
  ticketId: string
  messageId: string | null
  title: string
  body: string
  isRead: boolean
  createdAt: string
}

export function useSupportTickets(enabled = true) {
  return useQuery({
    queryKey: ['support', 'tickets'],
    queryFn: () => api.get('/api/support/tickets').then((res) => res.data.data as SupportTicket[]),
    enabled,
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    retry: 1,
  })
}

export function useSupportTicket(ticketId: string | null, enabled = true) {
  return useQuery({
    queryKey: ['support', 'ticket', ticketId],
    queryFn: () => api.get(`/api/support/tickets/${ticketId}`).then((res) => res.data.data as { ticket: SupportTicket; messages: SupportMessage[] }),
    enabled: enabled && Boolean(ticketId),
    staleTime: 20_000,
    refetchInterval: 20_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    retry: 1,
  })
}

export function useSupportUnreadCount(enabled = true) {
  return useQuery({
    queryKey: ['support', 'notifications', 'unread-count'],
    queryFn: () => api.get('/api/support/notifications/unread-count').then((res) => Number(res.data.data?.count ?? 0)),
    enabled,
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    retry: 1,
  })
}

export function useSupportNotifications(enabled = true) {
  return useQuery({
    queryKey: ['support', 'notifications'],
    queryFn: () => api.get('/api/support/notifications?limit=12').then((res) => res.data.data as SupportNotification[]),
    enabled,
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    retry: 1,
  })
}
