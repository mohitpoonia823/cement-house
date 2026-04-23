import { prisma } from '@cement-house/db'
import type { FastifyRequest, FastifyReply } from 'fastify'

export async function authenticate(req: FastifyRequest, reply: FastifyReply) {
  try {
    await req.jwtVerify()
    const jwtUser = req.user as { id: string; businessId: string }
    const user = await prisma.user.findUnique({
      where: { id: jwtUser.id },
      include: { business: true },
    })

    if (!user || !user.isActive || user.businessId !== jwtUser.businessId || !user.business?.isActive) {
      return reply.status(401).send({ success: false, error: 'Your session is no longer valid. Please sign in again.' })
    }

    req.user = {
      ...jwtUser,
      name: user.name,
      role: user.role,
      businessId: user.businessId,
      businessName: user.business.name,
      businessCity: user.business.city,
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

/** Extract businessId from JWT payload */
export function getBizId(req: FastifyRequest): string {
  return (req.user as any).businessId
}
