import type { FastifyRequest, FastifyReply } from 'fastify'

export async function authenticate(req: FastifyRequest, reply: FastifyReply) {
  try {
    await req.jwtVerify()
  } catch {
    reply.status(401).send({ success: false, error: 'Unauthorised' })
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
