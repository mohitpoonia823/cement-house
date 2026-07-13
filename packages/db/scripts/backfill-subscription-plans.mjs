// One-time Phase 2 cutover script — run manually AFTER deploying the unified
// billing changes:  pnpm --filter @cement-house/db db:backfill-plans
//
// 1. Aligns paid plan prices with platform settings. Until this deploy, the
//    billing-config screen mirrored one price onto every paid plan and checkout
//    charged the platform price, so this preserves today's effective pricing
//    while letting plans diverge from now on.
// 2. Points each paid business's live subscription row at the plan mapped from
//    its legacy Business.subscriptionPlan (STARTER→BASIC), fixing tenants that
//    the 011 migration parked on plan_free despite paying. Rows that already
//    reference a paid plan (bought via checkout) are left untouched.
//
// Idempotent: re-running makes no further changes.

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const LEGACY_TO_PLAN = { STARTER: 'BASIC', PRO: 'PRO', ENTERPRISE: 'ENTERPRISE' }

async function main() {
  const settings = await prisma.platformSetting.findUnique({ where: { id: 'default' } })
  if (settings) {
    const result = await prisma.plan.updateMany({
      where: { name: { in: ['BASIC', 'PRO', 'ENTERPRISE'] } },
      data: { priceMonthly: settings.monthlyPrice, priceYearly: settings.yearlyPrice },
    })
    console.log(`Aligned ${result.count} paid plans to platform pricing (${settings.monthlyPrice}/mo, ${settings.yearlyPrice}/yr).`)

    // Phase 2b: business price columns are now overrides (0 = none). Until this
    // deploy, registration and webhook activation copied the platform price in,
    // so values equal to it are system-written, not intentional custom pricing —
    // reset them so future plan-price changes reach these tenants. Values that
    // DIFFER from platform pricing are kept as deliberate admin overrides.
    const overridesReset = await prisma.business.updateMany({
      where: {
        monthlySubscriptionAmount: settings.monthlyPrice,
        yearlySubscriptionAmount: settings.yearlyPrice,
      },
      data: { monthlySubscriptionAmount: 0, yearlySubscriptionAmount: 0 },
    })
    console.log(`Reset ${overridesReset.count} system-written price copies to "no override".`)
  } else {
    console.log('No platform settings row found — skipping price alignment.')
  }

  const plans = await prisma.plan.findMany({ select: { id: true, name: true } })
  const planIdByName = Object.fromEntries(plans.map((p) => [p.name, p.id]))
  const freePlanId = planIdByName.FREE

  const paidBusinesses = await prisma.business.findMany({
    where: {
      subscriptionInterval: { not: null },
      subscriptionStatus: { in: ['ACTIVE', 'PAST_DUE'] },
    },
    select: { id: true, name: true, subscriptionPlan: true, subscriptionEndsAt: true },
  })

  let fixed = 0
  for (const business of paidBusinesses) {
    const targetPlanId = planIdByName[LEGACY_TO_PLAN[business.subscriptionPlan]]
    if (!targetPlanId) continue

    const live = await prisma.subscription.findFirst({
      where: { businessId: business.id, status: { in: ['TRIAL', 'ACTIVE'] } },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, planId: true, endDate: true },
    })

    if (live && live.planId === freePlanId) {
      await prisma.subscription.update({
        where: { id: live.id },
        data: {
          planId: targetPlanId,
          status: 'ACTIVE',
          endDate: business.subscriptionEndsAt ?? live.endDate,
        },
      })
      console.log(`Fixed ${business.name}: plan_free -> ${LEGACY_TO_PLAN[business.subscriptionPlan]}`)
      fixed += 1
    } else if (!live) {
      await prisma.subscription.create({
        data: {
          id: `sub_backfill_${business.id}`,
          businessId: business.id,
          planId: targetPlanId,
          status: 'ACTIVE',
          startDate: new Date(),
          endDate: business.subscriptionEndsAt,
          autoRenew: true,
        },
      })
      console.log(`Created missing subscription for ${business.name} on ${LEGACY_TO_PLAN[business.subscriptionPlan]}`)
      fixed += 1
    }
  }

  console.log(`Done. ${paidBusinesses.length} paid businesses scanned, ${fixed} subscription rows fixed.`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
