import { Prisma } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { prisma } from '../client'

export type SupportTicketStatus = 'OPEN' | 'RESOLVED'
export type SupportSenderRole = 'ADMIN' | 'BUSINESS'

let ensureSupportTablesPromise: Promise<void> | null = null

async function ensureSupportTables() {
  if (!ensureSupportTablesPromise) {
    ensureSupportTablesPromise = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS support_tickets (
          id TEXT PRIMARY KEY,
          business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
          created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          subject TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'OPEN',
          last_message_preview TEXT,
          last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          admin_last_read_at TIMESTAMPTZ,
          business_last_read_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `)
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS support_ticket_messages (
          id TEXT PRIMARY KEY,
          ticket_id TEXT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
          sender_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          sender_role TEXT NOT NULL,
          message TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `)
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS support_notifications (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          ticket_id TEXT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
          message_id TEXT REFERENCES support_ticket_messages(id) ON DELETE SET NULL,
          title TEXT NOT NULL,
          body TEXT NOT NULL,
          is_read BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `)
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS support_tickets_business_updated_idx
          ON support_tickets (business_id, updated_at DESC)
      `)
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS support_tickets_status_updated_idx
          ON support_tickets (status, updated_at DESC)
      `)
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS support_ticket_messages_ticket_created_idx
          ON support_ticket_messages (ticket_id, created_at ASC)
      `)
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS support_notifications_user_unread_idx
          ON support_notifications (user_id, is_read, created_at DESC)
      `)
    })().catch((error) => {
      ensureSupportTablesPromise = null
      throw error
    })
  }
  await ensureSupportTablesPromise
}

export interface SupportTicketRow {
  id: string
  businessId: string
  businessName: string
  createdByUserId: string
  createdByName: string
  subject: string
  status: SupportTicketStatus
  lastMessagePreview: string | null
  lastMessageAt: Date
  createdAt: Date
  updatedAt: Date
  unread: boolean
}

export interface SupportTicketMessageRow {
  id: string
  ticketId: string
  senderUserId: string
  senderName: string
  senderRole: SupportSenderRole
  message: string
  createdAt: Date
}

export interface SupportNotificationRow {
  id: string
  ticketId: string
  messageId: string | null
  title: string
  body: string
  isRead: boolean
  createdAt: Date
}

export async function createTicketWithInitialMessage(input: {
  businessId: string
  createdByUserId: string
  subject: string
  message: string
}) {
  await ensureSupportTables()
  const ticketId = randomUUID()
  const messageId = randomUUID()
  const now = new Date()

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      INSERT INTO support_tickets (
        id,
        business_id,
        created_by_user_id,
        subject,
        status,
        last_message_preview,
        last_message_at,
        business_last_read_at,
        created_at,
        updated_at
      ) VALUES (
        ${ticketId},
        ${input.businessId},
        ${input.createdByUserId},
        ${input.subject},
        'OPEN',
        ${input.message.slice(0, 220)},
        ${now},
        ${now},
        ${now},
        ${now}
      )
    `
    await tx.$executeRaw`
      INSERT INTO support_ticket_messages (
        id,
        ticket_id,
        sender_user_id,
        sender_role,
        message,
        created_at
      ) VALUES (
        ${messageId},
        ${ticketId},
        ${input.createdByUserId},
        'BUSINESS',
        ${input.message},
        ${now}
      )
    `
  })

  return { ticketId, messageId }
}

export async function addTicketMessage(input: {
  ticketId: string
  senderUserId: string
  senderRole: SupportSenderRole
  message: string
}) {
  await ensureSupportTables()
  const messageId = randomUUID()
  const now = new Date()

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      INSERT INTO support_ticket_messages (
        id,
        ticket_id,
        sender_user_id,
        sender_role,
        message,
        created_at
      ) VALUES (
        ${messageId},
        ${input.ticketId},
        ${input.senderUserId},
        ${input.senderRole},
        ${input.message},
        ${now}
      )
    `

    const readColumn = input.senderRole === 'ADMIN' ? Prisma.sql`admin_last_read_at` : Prisma.sql`business_last_read_at`
    await tx.$executeRaw(Prisma.sql`
      UPDATE support_tickets
      SET
        status = 'OPEN',
        last_message_preview = ${input.message.slice(0, 220)},
        last_message_at = ${now},
        updated_at = ${now},
        ${readColumn} = ${now}
      WHERE id = ${input.ticketId}
    `)
  })

  return { messageId, createdAt: now }
}

export async function getBusinessTickets(businessId: string) {
  await ensureSupportTables()
  const rows = await prisma.$queryRaw<SupportTicketRow[]>`
    SELECT
      st.id,
      st.business_id AS "businessId",
      b.name AS "businessName",
      st.created_by_user_id AS "createdByUserId",
      u.name AS "createdByName",
      st.subject,
      st.status::text AS status,
      st.last_message_preview AS "lastMessagePreview",
      st.last_message_at AS "lastMessageAt",
      st.created_at AS "createdAt",
      st.updated_at AS "updatedAt",
      (st.last_message_at > COALESCE(st.business_last_read_at, 'epoch'::timestamptz)) AS unread
    FROM support_tickets st
    INNER JOIN businesses b ON b.id = st.business_id
    INNER JOIN users u ON u.id = st.created_by_user_id
    WHERE st.business_id = ${businessId}
    ORDER BY st.updated_at DESC
  `
  return rows
}

export async function getAdminTickets(limit = 200) {
  await ensureSupportTables()
  const rows = await prisma.$queryRaw<SupportTicketRow[]>`
    SELECT
      st.id,
      st.business_id AS "businessId",
      b.name AS "businessName",
      st.created_by_user_id AS "createdByUserId",
      u.name AS "createdByName",
      st.subject,
      st.status::text AS status,
      st.last_message_preview AS "lastMessagePreview",
      st.last_message_at AS "lastMessageAt",
      st.created_at AS "createdAt",
      st.updated_at AS "updatedAt",
      (st.last_message_at > COALESCE(st.admin_last_read_at, 'epoch'::timestamptz)) AS unread
    FROM support_tickets st
    INNER JOIN businesses b ON b.id = st.business_id
    INNER JOIN users u ON u.id = st.created_by_user_id
    ORDER BY st.updated_at DESC
    LIMIT ${limit}
  `
  return rows
}

export async function getBusinessTicketById(ticketId: string, businessId: string) {
  await ensureSupportTables()
  const rows = await prisma.$queryRaw<SupportTicketRow[]>`
    SELECT
      st.id,
      st.business_id AS "businessId",
      b.name AS "businessName",
      st.created_by_user_id AS "createdByUserId",
      u.name AS "createdByName",
      st.subject,
      st.status::text AS status,
      st.last_message_preview AS "lastMessagePreview",
      st.last_message_at AS "lastMessageAt",
      st.created_at AS "createdAt",
      st.updated_at AS "updatedAt",
      (st.last_message_at > COALESCE(st.business_last_read_at, 'epoch'::timestamptz)) AS unread
    FROM support_tickets st
    INNER JOIN businesses b ON b.id = st.business_id
    INNER JOIN users u ON u.id = st.created_by_user_id
    WHERE st.id = ${ticketId} AND st.business_id = ${businessId}
    LIMIT 1
  `
  return rows.length > 0 ? rows[0] : null
}

export async function getAdminTicketById(ticketId: string) {
  await ensureSupportTables()
  const rows = await prisma.$queryRaw<SupportTicketRow[]>`
    SELECT
      st.id,
      st.business_id AS "businessId",
      b.name AS "businessName",
      st.created_by_user_id AS "createdByUserId",
      u.name AS "createdByName",
      st.subject,
      st.status::text AS status,
      st.last_message_preview AS "lastMessagePreview",
      st.last_message_at AS "lastMessageAt",
      st.created_at AS "createdAt",
      st.updated_at AS "updatedAt",
      (st.last_message_at > COALESCE(st.admin_last_read_at, 'epoch'::timestamptz)) AS unread
    FROM support_tickets st
    INNER JOIN businesses b ON b.id = st.business_id
    INNER JOIN users u ON u.id = st.created_by_user_id
    WHERE st.id = ${ticketId}
    LIMIT 1
  `
  return rows.length > 0 ? rows[0] : null
}

export async function markTicketRead(ticketId: string, readerRole: SupportSenderRole) {
  await ensureSupportTables()
  const readColumn = readerRole === 'ADMIN' ? Prisma.sql`admin_last_read_at` : Prisma.sql`business_last_read_at`
  await prisma.$executeRaw(Prisma.sql`
    UPDATE support_tickets
    SET ${readColumn} = NOW()
    WHERE id = ${ticketId}
  `)
}

export async function getTicketMessages(ticketId: string) {
  await ensureSupportTables()
  const rows = await prisma.$queryRaw<SupportTicketMessageRow[]>`
    SELECT
      stm.id,
      stm.ticket_id AS "ticketId",
      stm.sender_user_id AS "senderUserId",
      u.name AS "senderName",
      stm.sender_role::text AS "senderRole",
      stm.message,
      stm.created_at AS "createdAt"
    FROM support_ticket_messages stm
    INNER JOIN users u ON u.id = stm.sender_user_id
    WHERE stm.ticket_id = ${ticketId}
    ORDER BY stm.created_at ASC
  `
  return rows
}

async function refreshTicketLastMessage(tx: Prisma.TransactionClient, ticketId: string) {
  const latestRows = await tx.$queryRaw<Array<{ message: string; createdAt: Date }>>`
    SELECT message, created_at AS "createdAt"
    FROM support_ticket_messages
    WHERE ticket_id = ${ticketId}
    ORDER BY created_at DESC
    LIMIT 1
  `
  const latest = latestRows[0]

  if (latest) {
    await tx.$executeRaw`
      UPDATE support_tickets
      SET
        last_message_preview = ${latest.message.slice(0, 220)},
        last_message_at = ${latest.createdAt},
        updated_at = NOW()
      WHERE id = ${ticketId}
    `
    return
  }

  await tx.$executeRaw`
    UPDATE support_tickets
    SET
      last_message_preview = NULL,
      last_message_at = NOW(),
      updated_at = NOW()
    WHERE id = ${ticketId}
  `
}

export async function updateTicketMessage(input: {
  ticketId: string
  messageId: string
  senderUserId: string
  message: string
}) {
  await ensureSupportTables()
  const rows = await prisma.$transaction(async (tx) => {
    const updatedRows = await tx.$queryRaw<Array<{ id: string }>>`
      UPDATE support_ticket_messages
      SET message = ${input.message}
      WHERE id = ${input.messageId}
        AND ticket_id = ${input.ticketId}
        AND sender_user_id = ${input.senderUserId}
      RETURNING id
    `
    if (updatedRows.length === 0) return []
    await refreshTicketLastMessage(tx, input.ticketId)
    return updatedRows
  })
  return rows.length > 0
}

export async function deleteTicketMessage(input: {
  ticketId: string
  messageId: string
  senderUserId: string
}) {
  await ensureSupportTables()
  const rows = await prisma.$transaction(async (tx) => {
    const deletedRows = await tx.$queryRaw<Array<{ id: string }>>`
      DELETE FROM support_ticket_messages
      WHERE id = ${input.messageId}
        AND ticket_id = ${input.ticketId}
        AND sender_user_id = ${input.senderUserId}
      RETURNING id
    `
    if (deletedRows.length === 0) return []
    await refreshTicketLastMessage(tx, input.ticketId)
    return deletedRows
  })
  return rows.length > 0
}

export async function updateTicketStatus(ticketId: string, status: SupportTicketStatus) {
  await ensureSupportTables()
  await prisma.$executeRaw`
    UPDATE support_tickets
    SET status = ${status}, updated_at = NOW()
    WHERE id = ${ticketId}
  `
}

export async function getSuperAdminIds() {
  await ensureSupportTables()
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id
    FROM users
    WHERE role = 'SUPER_ADMIN'::"UserRole" AND "isActive" = true
  `
  return rows.map((row) => row.id)
}

export async function getBusinessUserIds(businessId: string) {
  await ensureSupportTables()
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id
    FROM users
    WHERE "businessId" = ${businessId} AND "isActive" = true
  `
  return rows.map((row) => row.id)
}

export async function createNotifications(input: {
  userIds: string[]
  ticketId: string
  messageId: string | null
  title: string
  body: string
}) {
  await ensureSupportTables()
  if (input.userIds.length === 0) return
  await prisma.$transaction(
    input.userIds.map((userId) =>
      prisma.$executeRaw`
        INSERT INTO support_notifications (
          id,
          user_id,
          ticket_id,
          message_id,
          title,
          body,
          is_read,
          created_at
        ) VALUES (
          ${randomUUID()},
          ${userId},
          ${input.ticketId},
          ${input.messageId},
          ${input.title},
          ${input.body},
          false,
          NOW()
        )
      `
    )
  )
}

export async function getNotificationsByUser(userId: string, limit = 20) {
  await ensureSupportTables()
  const rows = await prisma.$queryRaw<SupportNotificationRow[]>`
    SELECT
      id,
      ticket_id AS "ticketId",
      message_id AS "messageId",
      title,
      body,
      is_read AS "isRead",
      created_at AS "createdAt"
    FROM support_notifications
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `
  return rows
}

export async function getUnreadNotificationsCount(userId: string) {
  await ensureSupportTables()
  const rows = await prisma.$queryRaw<Array<{ count: number }>>`
    SELECT COUNT(*)::int AS count
    FROM support_notifications
    WHERE user_id = ${userId} AND is_read = false
  `
  return rows[0]?.count ?? 0
}

export async function markAllNotificationsRead(userId: string) {
  await ensureSupportTables()
  await prisma.$executeRaw`
    UPDATE support_notifications
    SET is_read = true
    WHERE user_id = ${userId} AND is_read = false
  `
}

export async function markNotificationRead(notificationId: string, userId: string) {
  await ensureSupportTables()
  await prisma.$executeRaw`
    UPDATE support_notifications
    SET is_read = true
    WHERE id = ${notificationId} AND user_id = ${userId}
  `
}
