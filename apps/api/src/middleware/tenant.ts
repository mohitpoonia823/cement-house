import type { FastifyRequest } from 'fastify'

export interface AuthTenantUser {
  id: string
  role: 'SUPER_ADMIN' | 'OWNER' | 'MUNIM'
  businessId?: string | null
  tenantId?: string | null
}

export function getTenantId(req: FastifyRequest): string {
  const user = req.user as AuthTenantUser
  const tenantId = user?.tenantId ?? user?.businessId ?? null
  if (!tenantId) {
    throw new Error('Tenant-scoped route requested without a tenant context')
  }
  return tenantId
}

export function getBusinessIdOrThrow(req: FastifyRequest): string {
  return getTenantId(req)
}

export function scopedWhere<T extends Record<string, unknown>>(
  req: FastifyRequest,
  extraWhere?: T,
): T & { businessId: string } {
  return {
    ...(extraWhere ?? ({} as T)),
    businessId: getBusinessIdOrThrow(req),
  }
}

export function assertBusinessRecord<T extends { businessId?: string | null }>(
  record: T | null | undefined,
  businessId: string,
): T {
  if (!record || record.businessId !== businessId) {
    throw new Error('Cross-tenant access blocked: record does not belong to this business')
  }
  return record
}

export function getTenantUser(req: FastifyRequest): AuthTenantUser {
  return req.user as AuthTenantUser
}
