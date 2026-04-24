import { prisma, type Prisma } from '@cement-house/db'

export async function createAuditLog(input: {
  actorId?: string | null
  businessId?: string | null
  action: string
  targetType: string
  targetId?: string | null
  metadata?: Record<string, unknown>
}) {
  return prisma.auditLog.create({
    data: {
      actorId: input.actorId ?? null,
      businessId: input.businessId ?? null,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      metadata: input.metadata as Prisma.InputJsonValue | undefined,
    },
  })
}
