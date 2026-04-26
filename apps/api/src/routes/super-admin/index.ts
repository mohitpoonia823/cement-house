import type { FastifyInstance } from 'fastify'
import { prisma } from '@cement-house/db'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { requireSuperAdmin } from '../../middleware/auth'
import { createAuditLog } from '../../services/audit'
import { ensurePlatformSettings } from '../../services/billing'

const UpdateBusinessSchema = z.object({
  isActive: z.boolean().optional(),
  suspendedReason: z.string().max(300).nullable().optional(),
  subscriptionPlan: z.enum(['STARTER', 'PRO', 'ENTERPRISE']).optional(),
  subscriptionStatus: z.enum(['TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'SUSPENDED']).optional(),
  subscriptionEndsAt: z.string().nullable().optional(),
  subscriptionInterval: z.enum(['MONTHLY', 'YEARLY']).nullable().optional(),
  trialDaysOverride: z.number().int().min(1).max(90).nullable().optional(),
  monthlySubscriptionAmount: z.number().min(0).optional(),
  yearlySubscriptionAmount: z.number().min(0).optional(),
})

const UpdateBillingConfigSchema = z.object({
  trialDays: z.number().int().min(1).max(90),
  monthlyPrice: z.number().min(0),
  yearlyPrice: z.number().min(0),
  currency: z.string().min(3).max(3),
  trialRequiresCard: z.boolean(),
})

const ListBusinessesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
  search: z.string().trim().optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
})

const ListUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(12),
  search: z.string().trim().optional(),
  role: z.enum(['SUPER_ADMIN', 'OWNER', 'MUNIM']).optional(),
})

const UpdateSuperAdminProfileSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(10).max(10),
})

const UpdateSuperAdminPasswordSchema = z.object({
  currentPassword: z.string().min(6),
  newPassword: z.string().min(6),
})

function startOfDay(date: Date) {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

function endOfDay(date: Date) {
  const next = new Date(date)
  next.setHours(23, 59, 59, 999)
  return next
}

function safeAmount(value: unknown) {
  return Number(value ?? 0)
}

function authPayloadForUser(user: {
  id: string
  name: string
  role: 'SUPER_ADMIN' | 'OWNER' | 'MUNIM'
  businessId: string | null
  permissions: string[]
  business?: {
    name: string
    city: string
    subscriptionStatus?: string
    subscriptionEndsAt?: Date | null
    subscriptionInterval?: 'MONTHLY' | 'YEARLY' | null
    monthlySubscriptionAmount?: unknown
    yearlySubscriptionAmount?: unknown
    trialStartedAt?: Date | null
    trialDaysOverride?: number | null
  } | null
}) {
  return {
    id: user.id,
    name: user.name,
    role: user.role,
    businessId: user.businessId,
    businessName: user.business?.name ?? null,
    businessCity: user.business?.city ?? null,
    permissions: user.permissions,
    subscriptionStatus: user.business?.subscriptionStatus ?? null,
    subscriptionEndsAt: user.business?.subscriptionEndsAt?.toISOString?.() ?? null,
    subscriptionInterval: user.business?.subscriptionInterval ?? null,
    monthlySubscriptionAmount: Number(user.business?.monthlySubscriptionAmount ?? 0),
    yearlySubscriptionAmount: Number(user.business?.yearlySubscriptionAmount ?? 0),
    trialStartedAt: user.business?.trialStartedAt?.toISOString?.() ?? null,
    trialDaysOverride: user.business?.trialDaysOverride ?? null,
    accessLocked: false,
    accessReason: null,
  }
}

export async function superAdminRoutes(app: FastifyInstance) {
  app.get('/profile', async (req, reply) => {
    if (!requireSuperAdmin(req, reply)) return

    const currentUserId = (req.user as any).id as string
    const profile = await prisma.user.findUnique({
      where: { id: currentUserId },
      select: {
        id: true,
        name: true,
        phone: true,
        role: true,
        createdAt: true,
        lastSeenAt: true,
      },
    })

    if (!profile || profile.role !== 'SUPER_ADMIN') {
      return reply.status(404).send({ success: false, error: 'Super Admin profile not found' })
    }

    return { success: true, data: profile }
  })

  app.patch('/profile', async (req, reply) => {
    if (!requireSuperAdmin(req, reply)) return

    const currentUserId = (req.user as any).id as string
    const body = UpdateSuperAdminProfileSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.message })

    const existing = await prisma.user.findUnique({
      where: { phone: body.data.phone },
      select: { id: true },
    })
    if (existing && existing.id !== currentUserId) {
      return reply.status(409).send({ success: false, error: 'Phone number is already used by another user' })
    }

    const updated = await prisma.user.update({
      where: { id: currentUserId },
      data: {
        name: body.data.name,
        phone: body.data.phone,
      },
      select: {
        id: true,
        name: true,
        phone: true,
        role: true,
        permissions: true,
        businessId: true,
      },
    })

    const authUser = authPayloadForUser({
      id: updated.id,
      name: updated.name,
      role: updated.role,
      businessId: updated.businessId,
      permissions: updated.permissions,
      business: null,
    })
    const token = app.jwt.sign(authUser, { expiresIn: '7d' })

    return {
      success: true,
      data: {
        profile: {
          id: updated.id,
          name: updated.name,
          phone: updated.phone,
          role: updated.role,
        },
        session: {
          token,
          user: authUser,
        },
      },
    }
  })

  app.patch('/password', async (req, reply) => {
    if (!requireSuperAdmin(req, reply)) return

    const currentUserId = (req.user as any).id as string
    const body = UpdateSuperAdminPasswordSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.message })

    const currentUser = await prisma.user.findUnique({
      where: { id: currentUserId },
      select: { id: true, passwordHash: true, role: true },
    })
    if (!currentUser || currentUser.role !== 'SUPER_ADMIN') {
      return reply.status(404).send({ success: false, error: 'Super Admin profile not found' })
    }

    const valid = await bcrypt.compare(body.data.currentPassword, currentUser.passwordHash)
    if (!valid) return reply.status(401).send({ success: false, error: 'Current password is incorrect' })

    const nextHash = await bcrypt.hash(body.data.newPassword, 10)
    await prisma.user.update({
      where: { id: currentUserId },
      data: { passwordHash: nextHash },
    })

    return { success: true, data: { message: 'Password updated successfully' } }
  })

  app.get('/billing-config', async (req, reply) => {
    if (!requireSuperAdmin(req, reply)) return
    const settings = await ensurePlatformSettings()

    return {
      success: true,
      data: {
        trialDays: settings.trialDays,
        monthlyPrice: safeAmount(settings.monthlyPrice),
        yearlyPrice: safeAmount(settings.yearlyPrice),
        currency: settings.currency,
        trialRequiresCard: settings.trialRequiresCard,
      },
    }
  })

  app.patch('/billing-config', async (req, reply) => {
    if (!requireSuperAdmin(req, reply)) return
    const body = UpdateBillingConfigSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.message })

    const settings = await prisma.platformSetting.upsert({
      where: { id: 'default' },
      update: {
        trialDays: body.data.trialDays,
        monthlyPrice: body.data.monthlyPrice,
        yearlyPrice: body.data.yearlyPrice,
        currency: body.data.currency.toUpperCase(),
        trialRequiresCard: body.data.trialRequiresCard,
      },
      create: {
        id: 'default',
        trialDays: body.data.trialDays,
        monthlyPrice: body.data.monthlyPrice,
        yearlyPrice: body.data.yearlyPrice,
        currency: body.data.currency.toUpperCase(),
        trialRequiresCard: body.data.trialRequiresCard,
      },
    })

    return {
      success: true,
      data: {
        trialDays: settings.trialDays,
        monthlyPrice: safeAmount(settings.monthlyPrice),
        yearlyPrice: safeAmount(settings.yearlyPrice),
        currency: settings.currency,
        trialRequiresCard: settings.trialRequiresCard,
      },
    }
  })

  app.get('/overview', async (req, reply) => {
    if (!requireSuperAdmin(req, reply)) return

    const now = new Date()
    const todayStart = startOfDay(now)
    const todayEnd = endOfDay(now)

    const [
      businesses,
      totalOwners,
      totalMunims,
      activeUsersToday,
      totalSales,
      todaySales,
      businessSales,
      ledgerDebits,
      ledgerCredits,
      remindersToday,
      failedReminders,
      challansToday,
      auditLogs,
    ] = await Promise.all([
      prisma.business.findMany({
        select: {
          id: true,
          name: true,
          city: true,
          isActive: true,
          subscriptionPlan: true,
          subscriptionStatus: true,
          monthlySubscriptionAmount: true,
          yearlySubscriptionAmount: true,
          subscriptionEndsAt: true,
          subscriptionInterval: true,
          trialDaysOverride: true,
          suspendedReason: true,
          createdAt: true,
          _count: {
            select: {
              users: true,
              customers: true,
              orders: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.count({ where: { isActive: true, role: 'OWNER' } }),
      prisma.user.count({ where: { isActive: true, role: 'MUNIM' } }),
      prisma.user.count({
        where: {
          isActive: true,
          lastSeenAt: { gte: todayStart, lte: todayEnd },
        },
      }),
      prisma.order.aggregate({
        where: { status: { not: 'CANCELLED' } },
        _sum: { totalAmount: true },
      }),
      prisma.order.aggregate({
        where: {
          status: { not: 'CANCELLED' },
          createdAt: { gte: todayStart, lte: todayEnd },
        },
        _sum: { totalAmount: true },
      }),
      prisma.order.groupBy({
        by: ['businessId'],
        where: { status: { not: 'CANCELLED' } },
        _sum: { totalAmount: true },
        _count: { id: true },
      }),
      prisma.ledgerEntry.groupBy({
        by: ['businessId'],
        where: { type: 'DEBIT' },
        _sum: { amount: true },
      }),
      prisma.ledgerEntry.groupBy({
        by: ['businessId'],
        where: { type: 'CREDIT' },
        _sum: { amount: true },
      }),
      prisma.reminder.count({
        where: { status: 'SENT', sentAt: { gte: todayStart, lte: todayEnd } },
      }),
      prisma.reminder.findMany({
        where: { status: 'FAILED' },
        include: { customer: { select: { name: true, business: { select: { name: true } } } } },
        orderBy: { createdAt: 'desc' },
        take: 6,
      }),
      prisma.auditLog.count({
        where: {
          action: 'CHALLAN_PDF_GENERATED',
          createdAt: { gte: todayStart, lte: todayEnd },
        },
      }),
      prisma.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          actor: { select: { name: true, role: true } },
          business: { select: { name: true, city: true } },
        },
      }),
    ])

    const salesMap = new Map(businessSales.map((item) => [item.businessId, safeAmount(item._sum.totalAmount)]))
    const debitMap = new Map(ledgerDebits.map((item) => [item.businessId, safeAmount(item._sum.amount)]))
    const creditMap = new Map(ledgerCredits.map((item) => [item.businessId, safeAmount(item._sum.amount)]))

    const businessRows = businesses.map((business) => ({
      id: business.id,
      name: business.name,
      city: business.city,
      isActive: business.isActive,
      subscriptionPlan: business.subscriptionPlan,
      subscriptionStatus: business.subscriptionStatus,
      subscriptionEndsAt: business.subscriptionEndsAt,
      subscriptionInterval: business.subscriptionInterval,
      trialDaysOverride: business.trialDaysOverride,
      monthlySubscriptionAmount: safeAmount(business.monthlySubscriptionAmount),
      yearlySubscriptionAmount: safeAmount(business.yearlySubscriptionAmount),
      suspendedReason: business.suspendedReason,
      users: business._count.users,
      customers: business._count.customers,
      orders: business._count.orders,
      gmv: salesMap.get(business.id) ?? 0,
      outstanding: (debitMap.get(business.id) ?? 0) - (creditMap.get(business.id) ?? 0),
      createdAt: business.createdAt,
    }))

    const revenueRunRate = businessRows
      .filter((business) => ['TRIAL', 'ACTIVE', 'PAST_DUE'].includes(business.subscriptionStatus))
      .reduce((sum, business) => sum + business.monthlySubscriptionAmount, 0)

    const activityFeed = [
      ...auditLogs.map((log) => ({
        id: log.id,
        kind: 'AUDIT',
        title: log.action.replace(/_/g, ' '),
        description: log.business?.name
          ? `${log.business.name}${log.actor?.name ? ` • by ${log.actor.name}` : ''}`
          : log.actor?.name ?? 'Platform activity',
        createdAt: log.createdAt,
      })),
      ...failedReminders.map((reminder) => ({
        id: reminder.id,
        kind: 'ERROR',
        title: 'Failed WhatsApp reminder',
        description: `${reminder.customer.business.name} • ${reminder.customer.name}`,
        createdAt: reminder.createdAt,
      })),
    ]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 12)

    return {
      success: true,
      data: {
        platformHealth: {
          totalBusinesses: businessRows.length,
          activeBusinesses: businessRows.filter((business) => business.isActive).length,
          suspendedBusinesses: businessRows.filter((business) => !business.isActive).length,
          totalOwners,
          totalMunims,
          dailyActiveUsers: activeUsersToday,
        },
        financialVolume: {
          totalGMV: safeAmount(totalSales._sum.totalAmount),
          todayGMV: safeAmount(todaySales._sum.totalAmount),
          monthlyRevenueRunRate: revenueRunRate,
          pastDueAccounts: businessRows.filter((business) => business.subscriptionStatus === 'PAST_DUE').length,
        },
        featureAdoption: {
          challanPdfsToday: challansToday,
          remindersSentToday: remindersToday,
          businessesOnPro: businessRows.filter((business) => business.subscriptionPlan === 'PRO').length,
          businessesInTrial: businessRows.filter((business) => business.subscriptionStatus === 'TRIAL').length,
        },
        topBusinesses: businessRows.sort((a, b) => b.gmv - a.gmv).slice(0, 5),
        activityFeed,
      },
    }
  })

  app.get('/businesses', async (req, reply) => {
    if (!requireSuperAdmin(req, reply)) return

    const query = ListBusinessesQuerySchema.safeParse(req.query)
    if (!query.success) return reply.status(400).send({ success: false, error: query.error.message })

    const { page, pageSize, search, status } = query.data
    const skip = (page - 1) * pageSize
    const where: any = {}

    if (status === 'ACTIVE') where.isActive = true
    if (status === 'SUSPENDED') where.isActive = false
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { city: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ]
    }

    const [businesses, total, sales, debits, credits, owners] = await Promise.all([
      prisma.business.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { users: true, customers: true, orders: true } },
        },
      }),
      prisma.business.count({ where }),
      prisma.order.groupBy({
        by: ['businessId'],
        where: { status: { not: 'CANCELLED' } },
        _sum: { totalAmount: true },
      }),
      prisma.ledgerEntry.groupBy({
        by: ['businessId'],
        where: { type: 'DEBIT' },
        _sum: { amount: true },
      }),
      prisma.ledgerEntry.groupBy({
        by: ['businessId'],
        where: { type: 'CREDIT' },
        _sum: { amount: true },
      }),
      prisma.user.findMany({
        where: { role: 'OWNER', isActive: true },
        select: { businessId: true, name: true, phone: true },
      }),
    ])

    const salesMap = new Map(sales.map((item) => [item.businessId, safeAmount(item._sum.totalAmount)]))
    const debitMap = new Map(debits.map((item) => [item.businessId, safeAmount(item._sum.amount)]))
    const creditMap = new Map(credits.map((item) => [item.businessId, safeAmount(item._sum.amount)]))
    const ownerMap = new Map(owners.filter((owner) => owner.businessId).map((owner) => [owner.businessId!, owner]))

    return {
      success: true,
      data: {
        items: businesses.map((business) => ({
          id: business.id,
          name: business.name,
          city: business.city,
          phone: business.phone,
          gstin: business.gstin,
          isActive: business.isActive,
          suspendedReason: business.suspendedReason,
          subscriptionPlan: business.subscriptionPlan,
          subscriptionStatus: business.subscriptionStatus,
          subscriptionEndsAt: business.subscriptionEndsAt,
          subscriptionInterval: business.subscriptionInterval,
          trialDaysOverride: business.trialDaysOverride,
          monthlySubscriptionAmount: safeAmount(business.monthlySubscriptionAmount),
          yearlySubscriptionAmount: safeAmount(business.yearlySubscriptionAmount),
          createdAt: business.createdAt,
          updatedAt: business.updatedAt,
          ownerName: ownerMap.get(business.id)?.name ?? null,
          ownerPhone: ownerMap.get(business.id)?.phone ?? null,
          totalUsers: business._count.users,
          totalCustomers: business._count.customers,
          totalOrders: business._count.orders,
          gmv: salesMap.get(business.id) ?? 0,
          outstanding: (debitMap.get(business.id) ?? 0) - (creditMap.get(business.id) ?? 0),
        })),
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    }
  })

  app.get('/users', async (req, reply) => {
    if (!requireSuperAdmin(req, reply)) return

    const query = ListUsersQuerySchema.safeParse(req.query)
    if (!query.success) return reply.status(400).send({ success: false, error: query.error.message })

    const { page, pageSize, search, role } = query.data
    const skip = (page - 1) * pageSize
    const where: any = {}

    if (role) where.role = role
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { business: { name: { contains: search, mode: 'insensitive' } } },
      ]
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: [{ createdAt: 'desc' }],
        include: {
          business: {
            select: { id: true, name: true, city: true, isActive: true },
          },
        },
      }),
      prisma.user.count({ where }),
    ])

    return {
      success: true,
      data: {
        items: users.map((user) => ({
          id: user.id,
          name: user.name,
          phone: user.phone,
          role: user.role,
          isActive: user.isActive,
          permissions: user.permissions,
          lastSeenAt: user.lastSeenAt,
          createdAt: user.createdAt,
          businessId: user.businessId,
          businessName: user.business?.name ?? null,
          businessCity: user.business?.city ?? null,
          businessActive: user.business?.isActive ?? null,
        })),
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    }
  })

  app.patch('/businesses/:id', async (req, reply) => {
    if (!requireSuperAdmin(req, reply)) return

    const { id } = req.params as { id: string }
    const body = UpdateBusinessSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.message })

    const current = await prisma.business.findUnique({ where: { id } })
    if (!current) return reply.status(404).send({ success: false, error: 'Business not found' })

    const nextStatus =
      body.data.subscriptionStatus ??
      (body.data.isActive === false ? 'SUSPENDED' : body.data.isActive === true && current.subscriptionStatus === 'SUSPENDED' ? 'ACTIVE' : undefined)

    const business = await prisma.business.update({
      where: { id },
      data: {
        ...(body.data.isActive !== undefined ? { isActive: body.data.isActive } : {}),
        ...(body.data.suspendedReason !== undefined ? { suspendedReason: body.data.suspendedReason } : {}),
        ...(body.data.subscriptionPlan ? { subscriptionPlan: body.data.subscriptionPlan } : {}),
        ...(nextStatus ? { subscriptionStatus: nextStatus } : {}),
        ...(body.data.subscriptionEndsAt !== undefined
          ? { subscriptionEndsAt: body.data.subscriptionEndsAt ? new Date(body.data.subscriptionEndsAt) : null }
          : {}),
        ...(body.data.subscriptionInterval !== undefined
          ? { subscriptionInterval: body.data.subscriptionInterval }
          : {}),
        ...(body.data.trialDaysOverride !== undefined
          ? { trialDaysOverride: body.data.trialDaysOverride }
          : {}),
        ...(body.data.monthlySubscriptionAmount !== undefined
          ? { monthlySubscriptionAmount: body.data.monthlySubscriptionAmount }
          : {}),
        ...(body.data.yearlySubscriptionAmount !== undefined
          ? { yearlySubscriptionAmount: body.data.yearlySubscriptionAmount }
          : {}),
      },
    })

    await createAuditLog({
      actorId: (req.user as any).id,
      businessId: business.id,
      action: body.data.isActive === false ? 'BUSINESS_SUSPENDED' : 'BUSINESS_UPDATED',
      targetType: 'BUSINESS',
      targetId: business.id,
      metadata: body.data,
    })

    return { success: true, data: business }
  })

  app.post('/businesses/:id/impersonate', async (req, reply) => {
    if (!requireSuperAdmin(req, reply)) return

    const { id } = req.params as { id: string }
    const business = await prisma.business.findUnique({
      where: { id },
      include: {
        users: {
          where: { isActive: true },
          orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
        },
      },
    })

    if (!business) return reply.status(404).send({ success: false, error: 'Business not found' })

    const targetUser = business.users.find((user) => user.role === 'OWNER') ?? business.users[0]
    if (!targetUser) {
      return reply.status(404).send({ success: false, error: 'No active user available to impersonate' })
    }

    const authUser = authPayloadForUser({
      id: targetUser.id,
      name: targetUser.name,
      role: targetUser.role,
      businessId: targetUser.businessId ?? null,
      permissions: targetUser.permissions,
      business: {
        name: business.name,
        city: business.city,
        subscriptionStatus: business.subscriptionStatus,
        subscriptionEndsAt: business.subscriptionEndsAt,
        subscriptionInterval: business.subscriptionInterval,
        monthlySubscriptionAmount: business.monthlySubscriptionAmount,
        yearlySubscriptionAmount: business.yearlySubscriptionAmount,
        trialStartedAt: business.trialStartedAt,
        trialDaysOverride: business.trialDaysOverride,
      },
    })

    const token = app.jwt.sign(authUser, { expiresIn: '2h' })

    await createAuditLog({
      actorId: (req.user as any).id,
      businessId: business.id,
      action: 'IMPERSONATION_STARTED',
      targetType: 'USER',
      targetId: targetUser.id,
      metadata: {
        businessName: business.name,
        impersonatedUser: targetUser.name,
        impersonatedRole: targetUser.role,
      },
    })

    return {
      success: true,
      data: {
        token,
        user: authUser,
        impersonation: {
          businessId: business.id,
          businessName: business.name,
          actorName: (req.user as any).name,
          actorId: (req.user as any).id,
          startedAt: new Date().toISOString(),
        },
      },
    }
  })
}
