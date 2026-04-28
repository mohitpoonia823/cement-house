import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { supportRepository } from '@cement-house/db'
import { getBizId, requireSuperAdmin } from '../../middleware/auth'

const CreateTicketSchema = z.object({
  subject: z.string().trim().min(2).max(120).optional(),
  message: z.string().trim().min(2).max(4000),
})

const AddMessageSchema = z.object({
  message: z.string().trim().min(1).max(4000),
})
const EditMessageSchema = z.object({
  message: z.string().trim().min(1).max(4000),
})

const UpdateStatusSchema = z.object({
  status: z.enum(['OPEN', 'RESOLVED']),
})

const NotificationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

function isSuperAdmin(req: any) {
  return req.user?.role === 'SUPER_ADMIN'
}

function defaultSubjectFromMessage(message: string) {
  const compact = message.replace(/\s+/g, ' ').trim()
  return compact.length > 70 ? `${compact.slice(0, 70)}...` : compact
}

export async function supportRoutes(app: FastifyInstance) {
  app.get('/tickets', async (req) => {
    if (isSuperAdmin(req)) {
      const tickets = await supportRepository.getAdminTickets(250)
      return { success: true, data: tickets }
    }
    const businessId = getBizId(req)
    const tickets = await supportRepository.getBusinessTickets(businessId)
    return { success: true, data: tickets }
  })

  app.post('/tickets', async (req, reply) => {
    if (isSuperAdmin(req)) return reply.status(403).send({ success: false, error: 'Super Admin cannot create tickets here' })
    const body = CreateTicketSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.message })

    const businessId = getBizId(req)
    const userId = (req.user as any).id as string
    const subject = body.data.subject?.trim() || defaultSubjectFromMessage(body.data.message)

    const created = await supportRepository.createTicketWithInitialMessage({
      businessId,
      createdByUserId: userId,
      subject,
      message: body.data.message,
    })

    const adminIds = await supportRepository.getSuperAdminIds()
    await supportRepository.createNotifications({
      userIds: adminIds,
      ticketId: created.ticketId,
      messageId: created.messageId,
      title: 'New support ticket',
      body: `${subject} - new message from workspace`,
    })

    return { success: true, data: { ticketId: created.ticketId } }
  })

  app.get('/tickets/:id', async (req, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(req.params)
    if (!params.success) return reply.status(400).send({ success: false, error: 'Invalid ticket id' })
    const ticketId = params.data.id

    const ticket = isSuperAdmin(req)
      ? await supportRepository.getAdminTicketById(ticketId)
      : await supportRepository.getBusinessTicketById(ticketId, getBizId(req))
    if (!ticket) return reply.status(404).send({ success: false, error: 'Ticket not found' })

    await supportRepository.markTicketRead(ticketId, isSuperAdmin(req) ? 'ADMIN' : 'BUSINESS')
    const messages = await supportRepository.getTicketMessages(ticketId)
    return { success: true, data: { ticket, messages } }
  })

  app.post('/tickets/:id/messages', async (req, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(req.params)
    if (!params.success) return reply.status(400).send({ success: false, error: 'Invalid ticket id' })
    const body = AddMessageSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.message })
    const ticketId = params.data.id
    const senderUserId = (req.user as any).id as string
    const senderIsAdmin = isSuperAdmin(req)

    const ticket = senderIsAdmin
      ? await supportRepository.getAdminTicketById(ticketId)
      : await supportRepository.getBusinessTicketById(ticketId, getBizId(req))
    if (!ticket) return reply.status(404).send({ success: false, error: 'Ticket not found' })

    const created = await supportRepository.addTicketMessage({
      ticketId,
      senderUserId,
      senderRole: senderIsAdmin ? 'ADMIN' : 'BUSINESS',
      message: body.data.message,
    })

    if (senderIsAdmin) {
      const businessUserIds = await supportRepository.getBusinessUserIds(ticket.businessId)
      await supportRepository.createNotifications({
        userIds: businessUserIds.filter((id) => id !== senderUserId),
        ticketId,
        messageId: created.messageId,
        title: 'Admin replied to your ticket',
        body: body.data.message.slice(0, 220),
      })
    } else {
      const adminIds = await supportRepository.getSuperAdminIds()
      await supportRepository.createNotifications({
        userIds: adminIds.filter((id) => id !== senderUserId),
        ticketId,
        messageId: created.messageId,
        title: 'New ticket message',
        body: `${ticket.businessName}: ${body.data.message.slice(0, 220)}`,
      })
    }

    return { success: true, data: { messageId: created.messageId, createdAt: created.createdAt.toISOString() } }
  })

  app.patch('/tickets/:id/messages/:messageId', async (req, reply) => {
    const params = z.object({ id: z.string().uuid(), messageId: z.string().uuid() }).safeParse(req.params)
    if (!params.success) return reply.status(400).send({ success: false, error: 'Invalid message route params' })
    const body = EditMessageSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.message })
    const ticketId = params.data.id
    const senderUserId = (req.user as any).id as string

    const ticket = isSuperAdmin(req)
      ? await supportRepository.getAdminTicketById(ticketId)
      : await supportRepository.getBusinessTicketById(ticketId, getBizId(req))
    if (!ticket) return reply.status(404).send({ success: false, error: 'Ticket not found' })

    const updated = await supportRepository.updateTicketMessage({
      ticketId,
      messageId: params.data.messageId,
      senderUserId,
      message: body.data.message,
    })
    if (!updated) {
      return reply.status(403).send({ success: false, error: 'Only sender can edit this message' })
    }
    return { success: true }
  })

  app.delete('/tickets/:id/messages/:messageId', async (req, reply) => {
    const params = z.object({ id: z.string().uuid(), messageId: z.string().uuid() }).safeParse(req.params)
    if (!params.success) return reply.status(400).send({ success: false, error: 'Invalid message route params' })
    const ticketId = params.data.id
    const senderUserId = (req.user as any).id as string

    const ticket = isSuperAdmin(req)
      ? await supportRepository.getAdminTicketById(ticketId)
      : await supportRepository.getBusinessTicketById(ticketId, getBizId(req))
    if (!ticket) return reply.status(404).send({ success: false, error: 'Ticket not found' })

    const deleted = await supportRepository.deleteTicketMessage({
      ticketId,
      messageId: params.data.messageId,
      senderUserId,
    })
    if (!deleted) {
      return reply.status(403).send({ success: false, error: 'Only sender can delete this message' })
    }
    return { success: true }
  })

  app.patch('/tickets/:id/status', async (req, reply) => {
    if (!requireSuperAdmin(req, reply)) return
    const params = z.object({ id: z.string().uuid() }).safeParse(req.params)
    if (!params.success) return reply.status(400).send({ success: false, error: 'Invalid ticket id' })
    const body = UpdateStatusSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.message })

    const ticket = await supportRepository.getAdminTicketById(params.data.id)
    if (!ticket) return reply.status(404).send({ success: false, error: 'Ticket not found' })

    await supportRepository.updateTicketStatus(params.data.id, body.data.status)
    return { success: true }
  })

  app.get('/notifications', async (req, reply) => {
    const query = NotificationQuerySchema.safeParse(req.query)
    if (!query.success) return reply.status(400).send({ success: false, error: query.error.message })
    const userId = (req.user as any).id as string
    const notifications = await supportRepository.getNotificationsByUser(userId, query.data.limit)
    return { success: true, data: notifications }
  })

  app.get('/notifications/unread-count', async (req) => {
    const userId = (req.user as any).id as string
    const count = await supportRepository.getUnreadNotificationsCount(userId)
    return { success: true, data: { count } }
  })

  app.post('/notifications/read-all', async (req) => {
    const userId = (req.user as any).id as string
    await supportRepository.markAllNotificationsRead(userId)
    return { success: true }
  })

  app.post('/notifications/:id/read', async (req, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(req.params)
    if (!params.success) return reply.status(400).send({ success: false, error: 'Invalid notification id' })
    const userId = (req.user as any).id as string
    await supportRepository.markNotificationRead(params.data.id, userId)
    return { success: true }
  })
}
