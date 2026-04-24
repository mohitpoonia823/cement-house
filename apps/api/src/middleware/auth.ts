import { prisma } from '@cement-house/db'
import type { FastifyRequest, FastifyReply } from 'fastify'

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
    const inactiveBusiness = !isSuperAdmin && !user?.business?.isActive

    if (!user || !user.isActive || tenantMismatch || inactiveBusiness) {
      return reply.status(401).send({ success: false, error: 'Your session is no longer valid. Please sign in again.' })
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
    } as any
  } catch {
    return reply.status(401).send({ success: false, error: 'Unauthorised' })
  }
}

/** Owner-only guard — call inside a route handler */
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

/** Extract businessId from JWT payload */
export function getBizId(req: FastifyRequest): string {
  const businessId = (req.user as any).businessId as string | null | undefined
  if (!businessId) {
    throw new Error('Business-scoped route requested without a business context')
  }
  return businessId
}
