import { prisma, subscriptionsRepository } from '@cement-house/db'
import type { SubscriptionStatus } from '@cement-house/db'
import type { FastifyRequest, FastifyReply } from 'fastify'
import { ensurePlatformSettings, syncBusinessStatusIfNeeded } from '../services/billing'
const LAST_SEEN_WRITE_COOLDOWN_MS = 5 * 60 * 1000
const lastSeenWriteByUser = new Map<string, number>()
const ACCESS_CONTEXT_TTL_MS = 15_000
const accessContextCache = new Map<string, { expiresAt: number; value: CachedAccessContext }>()
const accessContextInFlight = new Map<string, Promise<CachedAccessContext>>()

type CachedAccessContext = {
  accessLocked: boolean
  accessReason: string
  effectiveStatus: SubscriptionStatus | null
  endsAtIso: string | null
  monthlyPrice: number
  yearlyPrice: number
  rawFeatureFlags: Record<string, unknown>
}

function requestPath(req: FastifyRequest) {
  return req.url.split('?')[0]
}

function isLockedOwnerRouteAllowed(req: FastifyRequest, role: string) {
  const path = requestPath(req)
  if (role !== 'OWNER') return false
  if (path === '/api/settings' && req.method === 'GET') return true
  if (path.startsWith('/api/settings/subscription')) return true
  if (path.startsWith('/api/support')) return true
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
    message.includes('EMAXCONNSESSION') ||
    message.toLowerCase().includes('max clients reached') ||
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
    const missingTenantContext = !isSuperAdmin && !user?.businessId
    const inactiveBusiness = !isSuperAdmin && !user?.business?.isActive && user?.business?.subscriptionStatus !== 'SUSPENDED'

    if (!user || !user.isActive || tenantMismatch || missingTenantContext || inactiveBusiness) {
      return reply.status(401).send({ success: false, error: 'Your session is no longer valid. Please sign in again.' })
    }

    let accessLocked = false
    let accessReason = ''
    let effectiveStatus: SubscriptionStatus | null = user.business?.subscriptionStatus ?? null
    let endsAtIso: string | null = user.business?.subscriptionEndsAt?.toISOString?.() ?? null
    let monthlyPrice = 0
    let yearlyPrice = 0

    const now = new Date()
    const lastSeenAt = user.lastSeenAt ? new Date(user.lastSeenAt) : null
    const seenRecently = lastSeenAt && now.getTime() - lastSeenAt.getTime() < 5 * 60 * 1000
    const lastWriteAt = lastSeenWriteByUser.get(user.id) ?? 0
    const writeCooldownActive = now.getTime() - lastWriteAt < LAST_SEEN_WRITE_COOLDOWN_MS
    if (!seenRecently && !writeCooldownActive) {
      lastSeenWriteByUser.set(user.id, now.getTime())
      prisma.user.update({
        where: { id: user.id },
        data: { lastSeenAt: now },
      }).catch(() => undefined)
    }

    let rawFeatureFlags =
      user.business?.featureFlags && typeof user.business.featureFlags === 'object' && !Array.isArray(user.business.featureFlags)
        ? { ...(user.business.featureFlags as Record<string, unknown>) }
        : {}
    if (!isSuperAdmin && user.businessId && user.business) {
      const cacheKey = `${user.id}:${user.businessId}:${user.role}`
      const cached = accessContextCache.get(cacheKey)
      if (cached && cached.expiresAt > Date.now()) {
        accessLocked = cached.value.accessLocked
        accessReason = cached.value.accessReason
        effectiveStatus = cached.value.effectiveStatus
        endsAtIso = cached.value.endsAtIso
        monthlyPrice = cached.value.monthlyPrice
        yearlyPrice = cached.value.yearlyPrice
        rawFeatureFlags = { ...cached.value.rawFeatureFlags }
      } else {
        let work = accessContextInFlight.get(cacheKey)
        if (!work) {
          work = (async (): Promise<CachedAccessContext> => {
            const settings = await ensurePlatformSettings()
            await subscriptionsRepository.ensureDefaultSubscriptionForBusiness({
              businessId: user.businessId as string,
              trialDays: settings.trialDays,
            })
            const access = await syncBusinessStatusIfNeeded(prisma, user.business!, settings)
            const flags =
              user.business?.featureFlags && typeof user.business.featureFlags === 'object' && !Array.isArray(user.business.featureFlags)
                ? { ...(user.business.featureFlags as Record<string, unknown>) }
                : {}
            const activeSub = await subscriptionsRepository.getCurrentSubscriptionByBusiness(user.businessId as string)
            const planFeatures = (activeSub?.planFeatures ?? {}) as Record<string, unknown>
            for (const [key, value] of Object.entries(planFeatures)) {
              if (typeof value === 'boolean' && value === false && flags[key] === true) flags[key] = false
            }
            return {
              accessLocked: access.accessLocked,
              accessReason: access.reason,
              effectiveStatus: access.effectiveStatus,
              endsAtIso: access.endsAtIso,
              monthlyPrice: access.pricing.monthlyPrice,
              yearlyPrice: access.pricing.yearlyPrice,
              rawFeatureFlags: flags,
            }
          })().finally(() => accessContextInFlight.delete(cacheKey))
          accessContextInFlight.set(cacheKey, work)
        }

        const resolved = await work
        accessContextCache.set(cacheKey, {
          expiresAt: Date.now() + ACCESS_CONTEXT_TTL_MS,
          value: resolved,
        })
        accessLocked = resolved.accessLocked
        accessReason = resolved.accessReason
        effectiveStatus = resolved.effectiveStatus
        endsAtIso = resolved.endsAtIso
        monthlyPrice = resolved.monthlyPrice
        yearlyPrice = resolved.yearlyPrice
        rawFeatureFlags = { ...resolved.rawFeatureFlags }
      }
    }

    if (accessLocked && !isLockedOwnerRouteAllowed(req, user.role)) {
      return reply.status(402).send({
        success: false,
        code: 'SUBSCRIPTION_REQUIRED',
        error: accessReason,
        data: {
          accessLocked: true,
          role: user.role,
          businessId: user.businessId,
          businessName: user.business?.name,
          subscriptionStatus: effectiveStatus,
          subscriptionEndsAt: endsAtIso,
          monthlyPrice,
          yearlyPrice,
        },
      })
    }

    req.user = {
      ...jwtUser,
      name: user.name,
      role: user.role,
      businessId: user.businessId ?? null,
      tenantId: user.businessId ?? null,
      businessName: user.business?.name ?? null,
      businessCity: user.business?.city ?? null,
      permissions: user.permissions,
      subscriptionStatus: effectiveStatus,
      subscriptionEndsAt: user.business?.subscriptionEndsAt?.toISOString?.() ?? null,
      subscriptionInterval: user.business?.subscriptionInterval ?? null,
      monthlySubscriptionAmount: Number(user.business?.monthlySubscriptionAmount ?? 0),
      yearlySubscriptionAmount: Number(user.business?.yearlySubscriptionAmount ?? 0),
      enabledModules: Array.isArray(user.business?.enabledModules) ? user.business?.enabledModules : [],
      featureFlags: rawFeatureFlags,
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

export function getTenantId(req: FastifyRequest): string {
  return getBizId(req)
}
