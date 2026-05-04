import { PrismaClient, RiskTag, UserRole } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding database...')

  const superAdminHash = await bcrypt.hash('super123', 10)
  const ownerHash = await bcrypt.hash('owner123', 10)
  const munimHash = await bcrypt.hash('munim123', 10)

  await prisma.platformSetting.upsert({
    where: { id: 'default' },
    update: {
      trialDays: 7,
      monthlyPrice: 200,
      yearlyPrice: 2100,
      currency: 'INR',
      trialRequiresCard: true,
    },
    create: {
      id: 'default',
      trialDays: 7,
      monthlyPrice: 200,
      yearlyPrice: 2100,
      currency: 'INR',
      trialRequiresCard: true,
    },
  })

  await prisma.$executeRawUnsafe(`
    INSERT INTO plans (id, name, "priceMonthly", "priceYearly", description, "isActive", features)
    VALUES
      ('plan_free', 'FREE', 0, 0, 'Starter free access', TRUE, '{"allowAdvancedReports": false, "allowExports": false, "allowMultipleLocations": false}'),
      ('plan_basic', 'BASIC', 699, 6990, 'Basic paid plan', TRUE, '{"allowAdvancedReports": false, "allowExports": true, "allowMultipleLocations": false}'),
      ('plan_pro', 'PRO', 1499, 14990, 'Professional plan', TRUE, '{"allowAdvancedReports": true, "allowExports": true, "allowMultipleLocations": false}'),
      ('plan_enterprise', 'ENTERPRISE', 3999, 39990, 'Enterprise plan', TRUE, '{"allowAdvancedReports": true, "allowExports": true, "allowMultipleLocations": true}')
    ON CONFLICT (id) DO UPDATE
    SET
      name = EXCLUDED.name,
      "priceMonthly" = EXCLUDED."priceMonthly",
      "priceYearly" = EXCLUDED."priceYearly",
      description = EXCLUDED.description,
      "isActive" = EXCLUDED."isActive",
      features = EXCLUDED.features,
      "updatedAt" = NOW()
  `)
  await prisma.$executeRawUnsafe(`
    INSERT INTO plan_limits (
      id, "planId", "maxUsers", "maxProducts", "maxCustomers", "maxOrdersPerMonth", "maxInvoicesPerMonth", "storageLimit",
      "allowExports", "allowAdvancedReports", "allowMultipleLocations"
    )
    VALUES
      ('limit_free', 'plan_free', 2, 200, 300, 300, 300, 1073741824, FALSE, FALSE, FALSE),
      ('limit_basic', 'plan_basic', 5, 2000, 3000, 5000, 5000, 5368709120, TRUE, FALSE, FALSE),
      ('limit_pro', 'plan_pro', 20, 20000, 30000, 50000, 50000, 21474836480, TRUE, TRUE, FALSE),
      ('limit_enterprise', 'plan_enterprise', NULL, NULL, NULL, NULL, NULL, NULL, TRUE, TRUE, TRUE)
    ON CONFLICT ("planId") DO UPDATE
    SET
      "maxUsers" = EXCLUDED."maxUsers",
      "maxProducts" = EXCLUDED."maxProducts",
      "maxCustomers" = EXCLUDED."maxCustomers",
      "maxOrdersPerMonth" = EXCLUDED."maxOrdersPerMonth",
      "maxInvoicesPerMonth" = EXCLUDED."maxInvoicesPerMonth",
      "storageLimit" = EXCLUDED."storageLimit",
      "allowExports" = EXCLUDED."allowExports",
      "allowAdvancedReports" = EXCLUDED."allowAdvancedReports",
      "allowMultipleLocations" = EXCLUDED."allowMultipleLocations",
      "updatedAt" = NOW()
  `)

  const business = await prisma.business.upsert({
    where: { id: 'demo-business-seed-id' },
    update: {
      name: 'Poonia Trading Company',
      city: 'Hisar',
      phone: '9876543210',
      subscriptionPlan: 'PRO',
      subscriptionStatus: 'ACTIVE',
      subscriptionInterval: 'MONTHLY',
      subscriptionEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      monthlySubscriptionAmount: 2499,
      yearlySubscriptionAmount: 24990,
    },
    create: {
      id: 'demo-business-seed-id',
      name: 'Poonia Trading Company',
      city: 'Hisar',
      phone: '9876543210',
      subscriptionPlan: 'PRO',
      subscriptionStatus: 'ACTIVE',
      subscriptionInterval: 'MONTHLY',
      subscriptionEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      monthlySubscriptionAmount: 2499,
      yearlySubscriptionAmount: 24990,
    },
  })

  await prisma.$executeRaw`
    INSERT INTO subscriptions (
      id,
      "businessId",
      "planId",
      status,
      "startDate",
      "endDate",
      "trialEndDate",
      "autoRenew",
      "createdAt",
      "updatedAt"
    )
    VALUES (
      ${'sub_seed_demo_business'},
      ${business.id},
      ${'plan_pro'},
      ${'ACTIVE'},
      ${new Date()},
      ${new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)},
      ${null},
      ${true},
      NOW(),
      NOW()
    )
    ON CONFLICT DO NOTHING
  `

  await prisma.user.upsert({
    where: { phone: '9999999999' },
    update: {
      name: 'Platform Admin',
      role: UserRole.SUPER_ADMIN,
      passwordHash: superAdminHash,
      businessId: null,
      isActive: true,
    },
    create: {
      name: 'Platform Admin',
      phone: '9999999999',
      role: UserRole.SUPER_ADMIN,
      passwordHash: superAdminHash,
    },
  })

  await prisma.user.upsert({
    where: { phone: '9876543210' },
    update: {
      name: 'Ramesh Kumar',
      role: UserRole.OWNER,
      passwordHash: ownerHash,
      businessId: business.id,
      isActive: true,
    },
    create: {
      name: 'Ramesh Kumar',
      phone: '9876543210',
      role: UserRole.OWNER,
      passwordHash: ownerHash,
      businessId: business.id,
    },
  })

  await prisma.user.upsert({
    where: { phone: '9876543211' },
    update: {
      name: 'Sunil (Munim)',
      role: UserRole.MUNIM,
      passwordHash: munimHash,
      businessId: business.id,
      permissions: ['orders', 'customers', 'inventory', 'delivery', 'ledger'],
      isActive: true,
    },
    create: {
      name: 'Sunil (Munim)',
      phone: '9876543211',
      role: UserRole.MUNIM,
      passwordHash: munimHash,
      businessId: business.id,
      permissions: ['orders', 'customers', 'inventory', 'delivery', 'ledger'],
    },
  })

  await prisma.material.createMany({
    skipDuplicates: true,
    data: [
      { name: 'OPC Cement', unit: 'bags', stockQty: 840, minThreshold: 200, maxThreshold: 1000, purchasePrice: 350, salePrice: 380, businessId: business.id },
      { name: 'Bajri / Sand', unit: 'MT', stockQty: 18, minThreshold: 25, maxThreshold: 50, purchasePrice: 2700, salePrice: 3000, businessId: business.id },
      { name: 'Crusher Material', unit: 'MT', stockQty: 42, minThreshold: 10, maxThreshold: 60, purchasePrice: 1750, salePrice: 2000, businessId: business.id },
      { name: 'Saria / Steel', unit: 'MT', stockQty: 4.2, minThreshold: 5, maxThreshold: 30, purchasePrice: 52000, salePrice: 56000, businessId: business.id },
    ],
  })

  await prisma.customer.createMany({
    skipDuplicates: true,
    data: [
      { name: 'Rajesh Builders', phone: '9812340001', address: 'Sector 7, Hisar', creditLimit: 150000, riskTag: RiskTag.WATCH, businessId: business.id },
      { name: 'Suresh Contractor', phone: '9812340002', address: 'Sector 14, Hisar', creditLimit: 100000, riskTag: RiskTag.RELIABLE, businessId: business.id },
      { name: 'Om Constructions', phone: '9812340003', address: 'Model Town, Hisar', creditLimit: 80000, riskTag: RiskTag.RELIABLE, businessId: business.id },
      { name: 'Vikram Singh', phone: '9812340004', address: 'HUDA Sector 3, Hisar', creditLimit: 50000, riskTag: RiskTag.RELIABLE, businessId: business.id },
      { name: 'Deepak Sharma', phone: '9812340005', address: 'Hansi Road, Hisar', creditLimit: 60000, riskTag: RiskTag.RELIABLE, businessId: business.id },
    ],
  })

  console.log('Seed complete.')
  console.log('Super Admin  -> phone: 9999999999  password: super123')
  console.log('Owner login  -> phone: 9876543210  password: owner123')
  console.log('Munim login  -> phone: 9876543211  password: munim123')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
