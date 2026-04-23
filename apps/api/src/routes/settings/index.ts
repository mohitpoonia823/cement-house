import type { FastifyInstance } from 'fastify'
import { z }         from 'zod'
import bcrypt        from 'bcryptjs'
import { prisma }    from '@cement-house/db'
import { getBizId, requireOwner } from '../../middleware/auth'

const UpdateBusinessSchema = z.object({
  name:    z.string().min(2).optional(),
  city:    z.string().min(2).optional(),
  address: z.string().optional(),
  phone:   z.string().optional(),
  gstin:   z.string().optional(),
})

const UpdateReminderRulesSchema = z.object({
  remindersEnabled:   z.boolean().optional(),
  reminderSoftDays:   z.number().min(1).optional(),
  reminderFollowDays: z.number().min(1).optional(),
  reminderFirmDays:   z.number().min(1).optional(),
})

const UpdateProfileSchema = z.object({
  name:  z.string().min(2).optional(),
  phone: z.string().min(10).max(10).optional(),
})

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(6),
  newPassword:     z.string().min(6),
})

const CreateStaffSchema = z.object({
  name: z.string().min(2),
  phone: z.string().min(10).max(10),
  password: z.string().min(6),
  permissions: z.array(z.string()).default([]),
})

const UpdateStaffSchema = z.object({
  name: z.string().min(2).optional(),
  phone: z.string().min(10).max(10).optional(),
  permissions: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
})

export async function settingsRoutes(app: FastifyInstance) {
  // GET /api/settings — get business info + user profile
  app.get('/', async (req) => {
    const bizId  = getBizId(req)
    const userId = (req.user as any).id

    const [business, user] = await Promise.all([
      prisma.business.findUnique({ where: { id: bizId } }),
      prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, phone: true, role: true } }),
    ])

    return { success: true, data: { business, user } }
  })

  // PATCH /api/settings/business — update business details (owner only)
  app.patch('/business', async (req, reply) => {
    if (!requireOwner(req, reply)) return
    const bizId = getBizId(req)
    const body = UpdateBusinessSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.message })

    const business = await prisma.business.update({
      where: { id: bizId },
      data:  body.data,
    })

    return { success: true, data: business }
  })

  // PATCH /api/settings/reminders — update automated reminder rules
  app.patch('/reminders', async (req, reply) => {
    const bizId = getBizId(req)
    const body = UpdateReminderRulesSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.message })

    const business = await prisma.business.update({
      where: { id: bizId },
      data:  body.data,
    })

    return { success: true, data: business }
  })

  // PATCH /api/settings/profile — update own profile
  app.patch('/profile', async (req, reply) => {
    const userId = (req.user as any).id
    const body = UpdateProfileSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.message })

    // Check phone uniqueness if changing
    if (body.data.phone) {
      const existing = await prisma.user.findUnique({ where: { phone: body.data.phone } })
      if (existing && existing.id !== userId) {
        return reply.status(409).send({ success: false, error: 'A user with this phone number already exists' })
      }
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data:  body.data,
      select: { id: true, name: true, phone: true, role: true },
    })

    return { success: true, data: user }
  })

  // POST /api/settings/change-password — change own password
  app.post('/change-password', async (req, reply) => {
    const userId = (req.user as any).id
    const body = ChangePasswordSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.message })

    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) return reply.status(404).send({ success: false, error: 'User not found' })

    const valid = await bcrypt.compare(body.data.currentPassword, user.passwordHash)
    if (!valid) return reply.status(401).send({ success: false, error: 'Current password is incorrect' })

    const passwordHash = await bcrypt.hash(body.data.newPassword, 10)
    await prisma.user.update({ where: { id: userId }, data: { passwordHash } })

    return { success: true }
  })

  // GET /api/settings/staff — list staff (owner only)
  app.get('/staff', async (req, reply) => {
    if (!requireOwner(req, reply)) return
    const bizId = getBizId(req)
    const staff = await prisma.user.findMany({
      where: { businessId: bizId, role: 'MUNIM' },
      select: { id: true, name: true, phone: true, role: true, permissions: true, isActive: true, createdAt: true },
    })
    return { success: true, data: staff }
  })

  // POST /api/settings/staff — create staff (owner only)
  app.post('/staff', async (req, reply) => {
    if (!requireOwner(req, reply)) return
    const bizId = getBizId(req)
    const body = CreateStaffSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.message })

    const existing = await prisma.user.findUnique({ where: { phone: body.data.phone } })
    if (existing) return reply.status(409).send({ success: false, error: 'A user with this phone number already exists' })

    const passwordHash = await bcrypt.hash(body.data.password, 10)
    const staff = await prisma.user.create({
      data: {
        name: body.data.name,
        phone: body.data.phone,
        passwordHash,
        role: 'MUNIM',
        permissions: body.data.permissions,
        businessId: bizId,
      },
      select: { id: true, name: true, phone: true, role: true, permissions: true, isActive: true },
    })
    return { success: true, data: staff }
  })

  // PATCH /api/settings/staff/:id — update staff (owner only)
  app.patch('/staff/:id', async (req, reply) => {
    if (!requireOwner(req, reply)) return
    const { id } = req.params as any
    const body = UpdateStaffSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.message })

    if (body.data.phone) {
      const existing = await prisma.user.findUnique({ where: { phone: body.data.phone } })
      if (existing && existing.id !== id) {
        return reply.status(409).send({ success: false, error: 'A user with this phone number already exists' })
      }
    }

    const staff = await prisma.user.update({
      where: { id },
      data: body.data,
      select: { id: true, name: true, phone: true, role: true, permissions: true, isActive: true },
    })
    return { success: true, data: staff }
  })

  // DELETE /api/settings/staff/:id — soft delete staff (owner only)
  app.delete('/staff/:id', async (req, reply) => {
    if (!requireOwner(req, reply)) return
    const { id } = req.params as any
    await prisma.user.update({ where: { id }, data: { isActive: false } })
    return { success: true }
  })
}
