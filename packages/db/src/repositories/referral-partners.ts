import { Prisma } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { prisma } from '../client'

export type ReferralRewardType = 'FLAT' | 'PERCENT'

export interface ReferralPartnerRow {
  id: string
  businessId: string
  name: string
  phone: string
  role: string
  area: string | null
  notes: string | null
  rewardType: ReferralRewardType
  rewardValue: number
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

interface CreateReferralPartnerInput {
  businessId: string
  name: string
  phone: string
  role: string
  area?: string
  notes?: string
  rewardType: ReferralRewardType
  rewardValue: number
}

interface UpdateReferralPartnerInput {
  name?: string
  phone?: string
  role?: string
  area?: string
  notes?: string
  rewardType?: ReferralRewardType
  rewardValue?: number
  isActive?: boolean
}

export async function listReferralPartners(businessId: string, search?: string) {
  const filters: Prisma.Sql[] = [Prisma.sql`rp."businessId" = ${businessId}`, Prisma.sql`rp."isActive" = true`]
  if (search) filters.push(Prisma.sql`rp.name ILIKE ${`%${search}%`}`)

  return prisma.$queryRaw<ReferralPartnerRow[]>(Prisma.sql`
    SELECT
      rp.id,
      rp."businessId" AS "businessId",
      rp.name,
      rp.phone,
      rp.role,
      rp.area,
      rp.notes,
      rp."rewardType"::text AS "rewardType",
      rp."rewardValue"::double precision AS "rewardValue",
      rp."isActive" AS "isActive",
      rp."createdAt" AS "createdAt",
      rp."updatedAt" AS "updatedAt"
    FROM referral_partners rp
    WHERE ${Prisma.join(filters, ' AND ')}
    ORDER BY rp.name ASC
  `)
}

export async function getReferralPartnerById(partnerId: string, businessId: string) {
  const rows = await prisma.$queryRaw<ReferralPartnerRow[]>(Prisma.sql`
    SELECT
      rp.id,
      rp."businessId" AS "businessId",
      rp.name,
      rp.phone,
      rp.role,
      rp.area,
      rp.notes,
      rp."rewardType"::text AS "rewardType",
      rp."rewardValue"::double precision AS "rewardValue",
      rp."isActive" AS "isActive",
      rp."createdAt" AS "createdAt",
      rp."updatedAt" AS "updatedAt"
    FROM referral_partners rp
    WHERE rp.id = ${partnerId}
      AND rp."businessId" = ${businessId}
    LIMIT 1
  `)
  return rows[0] ?? null
}

export async function createReferralPartner(input: CreateReferralPartnerInput) {
  const rows = await prisma.$queryRaw<ReferralPartnerRow[]>(Prisma.sql`
    INSERT INTO referral_partners (
      id,
      "businessId",
      name,
      phone,
      role,
      area,
      notes,
      "rewardType",
      "rewardValue",
      "isActive",
      "createdAt",
      "updatedAt"
    ) VALUES (
      ${randomUUID()},
      ${input.businessId},
      ${input.name},
      ${input.phone},
      ${input.role},
      ${input.area ?? null},
      ${input.notes ?? null},
      ${input.rewardType}::"ReferralRewardType",
      ${input.rewardValue},
      true,
      NOW(),
      NOW()
    )
    RETURNING
      id,
      "businessId" AS "businessId",
      name,
      phone,
      role,
      area,
      notes,
      "rewardType"::text AS "rewardType",
      "rewardValue"::double precision AS "rewardValue",
      "isActive" AS "isActive",
      "createdAt" AS "createdAt",
      "updatedAt" AS "updatedAt"
  `)
  return rows[0]
}

export async function updateReferralPartner(partnerId: string, businessId: string, patch: UpdateReferralPartnerInput) {
  const rows = await prisma.$queryRaw<ReferralPartnerRow[]>(Prisma.sql`
    UPDATE referral_partners
    SET
      name = COALESCE(${patch.name ?? null}, name),
      phone = COALESCE(${patch.phone ?? null}, phone),
      role = COALESCE(${patch.role ?? null}, role),
      area = COALESCE(${patch.area ?? null}, area),
      notes = COALESCE(${patch.notes ?? null}, notes),
      "rewardType" = COALESCE(${patch.rewardType ?? null}::"ReferralRewardType", "rewardType"),
      "rewardValue" = COALESCE(${patch.rewardValue ?? null}, "rewardValue"),
      "isActive" = COALESCE(${patch.isActive ?? null}, "isActive"),
      "updatedAt" = NOW()
    WHERE id = ${partnerId}
      AND "businessId" = ${businessId}
    RETURNING
      id,
      "businessId" AS "businessId",
      name,
      phone,
      role,
      area,
      notes,
      "rewardType"::text AS "rewardType",
      "rewardValue"::double precision AS "rewardValue",
      "isActive" AS "isActive",
      "createdAt" AS "createdAt",
      "updatedAt" AS "updatedAt"
  `)
  return rows[0] ?? null
}

export async function softDeleteReferralPartner(partnerId: string, businessId: string) {
  await prisma.$executeRaw(Prisma.sql`
    UPDATE referral_partners
    SET "isActive" = false, "updatedAt" = NOW()
    WHERE id = ${partnerId}
      AND "businessId" = ${businessId}
  `)
}

export async function getReferralLeaderboard(input: { businessId: string; from?: Date; to?: Date }) {
  const filters: Prisma.Sql[] = [Prisma.sql`o."businessId" = ${input.businessId}`, Prisma.sql`o."isDeleted" = false`, Prisma.sql`o."referralPartnerId" IS NOT NULL`]
  if (input.from) filters.push(Prisma.sql`o."createdAt" >= ${input.from}`)
  if (input.to) filters.push(Prisma.sql`o."createdAt" <= ${input.to}`)

  return prisma.$queryRaw<Array<{
    partnerId: string
    partnerName: string
    partnerRole: string
    orderCount: number
    totalSales: number
    totalReward: number
  }>>(Prisma.sql`
    SELECT
      rp.id AS "partnerId",
      rp.name AS "partnerName",
      rp.role AS "partnerRole",
      COUNT(o.id)::int AS "orderCount",
      COALESCE(SUM(COALESCE(o."grandTotal", o."totalAmount")), 0)::double precision AS "totalSales",
      COALESCE(SUM(COALESCE(o."referralRewardAmount", 0)), 0)::double precision AS "totalReward"
    FROM orders o
    INNER JOIN referral_partners rp ON rp.id = o."referralPartnerId"
    WHERE ${Prisma.join(filters, ' AND ')}
    GROUP BY rp.id, rp.name, rp.role
    ORDER BY "totalSales" DESC, "orderCount" DESC
  `)
}
