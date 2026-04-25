import { prisma } from '@cement-house/db'
import type { FastifyRequest, FastifyReply } from 'fastify'
import { ensurePlatformSettings, syncBusinessStatusIfNeeded } from '../services/billing'

function requestPath(req: FastifyRequest) {
  return req.url.split('?')[0]
}

function isLockedOwnerRouteAllowed(req: FastifyRequest, role: string) {
  const path = requestPath(req)
  if (role !== 'OWNER') return false
  if (path === '/api/settings' && req.method === 'GET') return true
  if (path.startsWith('/api/settings/subscription')) return true
  return false
}

function isDatabaseConnectivityError(error: unknown) {
  const message = String((error as any)?.message ?? '')
  const code = String((error as any)?.code ?? '')
  return (
    message.includes("Can't reach database server") ||
    message.includes('ECONNREFUSED') ||
    message.includes('ETIMEDOUT') ||
    message.includes('ENOTFOUND') ||
    code === 'P1001'
  )
}

function isJwtAuthError(error: unknown) {
  const code = String((error as any)?.code ?? '')
  const name = String((error as any)?.name ?? '')
  return code.startsWith('FST_JWT') || name.includes('JsonWebTokenError') || name.includes('TokenExpiredError')
}

export async function authenticate(req: FastifyRequest, reply: FastifyReply) {
  try {
    await req.jwtVerify()
    const jwtUser = req.user as { id: string; businessId?: string | null }
    const user = await prisma.user.findUnique({
      where: { id: jwtUser.id },
      include: { business: true },
    })

    const isSuperAdmin = user?.role === 'SUPER_ADMIN'
    const tenantMismatch = !isSuperAdmin && user?.businessId !== (jwtUser.businessId ?? null)
    const inactiveBusiness = !isSuperAdmin && !user?.business?.isActive && user?.business?.subscriptionStatus !== 'SUSPENDED'

    if (!user || !user.isActive || tenantMismatch || inactiveBusiness) {
      return reply.status(401).send({ success: false, error: 'Your session is no longer valid. Please sign in again.' })
    }

    let accessLocked = false
    let accessReason = ''
    let effectiveStatus = user.business?.subscriptionStatus ?? null

    if (!isSuperAdmin && user.business) {
      const settings = await ensurePlatformSettings()
      const access = await syncBusinessStatusIfNeeded(prisma, user.business, settings)
      accessLocked = access.accessLocked
      accessReason = access.reason
      effectiveStatus = access.effectiveStatus

      if (accessLocked && !isLockedOwnerRouteAllowed(req, user.role)) {
        return reply.status(402).send({
          success: false,
          code: 'SUBSCRIPTION_REQUIRED',
          error: accessReason,
          data: {
            accessLocked: true,
            role: user.role,
            businessId: user.businessId,
            businessName: user.business.name,
            subscriptionStatus: access.effectiveStatus,
            subscriptionEndsAt: access.endsAtIso,
            monthlyPrice: access.pricing.monthlyPrice,
            yearlyPrice: access.pricing.yearlyPrice,
          },
        })
      }
    }

    const now = new Date()
    const lastSeenAt = user.lastSeenAt ? new Date(user.lastSeenAt) : null
    const seenRecently = lastSeenAt && now.getTime() - lastSeenAt.getTime() < 5 * 60 * 1000
    if (!seenRecently) {
      prisma.user.update({
        where: { id: user.id },
        data: { lastSeenAt: now },
      }).catch(() => undefined)
    }

    req.user = {
      ...jwtUser,
      name: user.name,
      role: user.role,
      businessId: user.businessId ?? null,
      businessName: user.business?.name ?? null,
      businessCity: user.business?.city ?? null,
      permissions: user.permissions,
      subscriptionStatus: effectiveStatus,
      subscriptionEndsAt: user.business?.subscriptionEndsAt?.toISOString?.() ?? null,
      subscriptionInterval: user.business?.subscriptionInterval ?? null,
      monthlySubscriptionAmount: Number(user.business?.monthlySubscriptionAmount ?? 0),
      yearlySubscriptionAmount: Number(user.business?.yearlySubscriptionAmount ?? 0),
      accessLocked,
      accessReason,
    } as any
  } catch (error) {
    if (isDatabaseConnectivityError(error)) {
      return reply.status(503).send({
        success: false,
        error: 'Service temporarily unavailable. Please try again in a moment.',
      })
    }
    if (isJwtAuthError(error)) {
      return reply.status(401).send({ success: false, error: 'Unauthorised' })
    }
    return reply.status(500).send({ success: false, error: 'Authentication service error' })
  }
}

export function requireOwner(req: FastifyRequest, reply: FastifyReply) {
  const user = req.user as { role: string }
  if (user.role !== 'OWNER') {
    reply.status(403).send({ success: false, error: 'Owner access required' })
    return false
  }
  return true
}

export function requireSuperAdmin(req: FastifyRequest, reply: FastifyReply) {
  const user = req.user as { role: string }
  if (user.role !== 'SUPER_ADMIN') {
    reply.status(403).send({ success: false, error: 'Super Admin access required' })
    return false
  }
  return true
}

export function getBizId(req: FastifyRequest): string {
  const businessId = (req.user as any).businessId as string | null | undefined
  if (!businessId) {
    throw new Error('Business-scoped route requested without a business context')
  }
  return businessId
}
