import { Prisma } from '@prisma/client'

export interface TenantScopedInput {
  businessId: string
}

export function requireTenantId(tenantId: string | null | undefined): string {
  const id = tenantId?.trim()
  if (!id) {
    throw new Error('Missing tenant context (businessId)')
  }
  return id
}

export function toTenantScoped<T extends Record<string, unknown>>(
  tenantId: string,
  where: T,
): T & { businessId: string } {
  return { ...where, businessId: requireTenantId(tenantId) }
}

export function tenantWhereSql(alias: string, tenantId: string) {
  return Prisma.sql`${Prisma.raw(alias)}."businessId" = ${requireTenantId(tenantId)}`
}

