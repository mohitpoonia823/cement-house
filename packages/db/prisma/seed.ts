/**
 * Seed script — creates demo data for development.
 * Run: pnpm db:seed
 */
import { PrismaClient, UserRole, RiskTag } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding database...')

  // ── Users ──
  const ownerHash = await bcrypt.hash('owner123', 10)
  const munimHash = await bcrypt.hash('munim123', 10)

  const owner = await prisma.user.upsert({
    where: { phone: '9876543210' },
    update: {},
    create: {
      name: 'Ramesh Kumar',
      phone: '9876543210',
      role: UserRole.OWNER,
      passwordHash: ownerHash,
    },
  })

  const munim = await prisma.user.upsert({
    where: { phone: '9876543211' },
    update: {},
    create: {
      name: 'Sunil (Munim)',
      phone: '9876543211',
      role: UserRole.MUNIM,
      passwordHash: munimHash,
    },
  })

  // ── Materials ──
  await prisma.material.createMany({
    skipDuplicates: true,
    data: [
      { name: 'OPC Cement',       unit: 'bags', stockQty: 840, minThreshold: 200, maxThreshold: 1000, purchasePrice: 350, salePrice: 380 },
      { name: 'Bajri / Sand',     unit: 'MT',   stockQty: 18,  minThreshold: 25,  maxThreshold: 50,   purchasePrice: 2700, salePrice: 3000 },
      { name: 'Crusher Material', unit: 'MT',   stockQty: 42,  minThreshold: 10,  maxThreshold: 60,   purchasePrice: 1750, salePrice: 2000 },
      { name: 'Saria / Steel',    unit: 'MT',   stockQty: 4.2, minThreshold: 5,   maxThreshold: 30,   purchasePrice: 52000, salePrice: 56000 },
    ],
  })

  // ── Customers ──
  await prisma.customer.createMany({
    skipDuplicates: true,
    data: [
      { name: 'Rajesh Builders',    phone: '9812340001', address: 'Sector 7, Hisar',     creditLimit: 150000, riskTag: RiskTag.WATCH },
      { name: 'Suresh Contractor',  phone: '9812340002', address: 'Sector 14, Hisar',    creditLimit: 100000, riskTag: RiskTag.RELIABLE },
      { name: 'Om Constructions',   phone: '9812340003', address: 'Model Town, Hisar',   creditLimit: 80000,  riskTag: RiskTag.RELIABLE },
      { name: 'Vikram Singh',       phone: '9812340004', address: 'HUDA Sector 3, Hisar',creditLimit: 50000,  riskTag: RiskTag.RELIABLE },
      { name: 'Deepak Sharma',      phone: '9812340005', address: 'Hansi Road, Hisar',   creditLimit: 60000,  riskTag: RiskTag.RELIABLE },
    ],
  })

  console.log('Seed complete.')
  console.log('Owner login  → phone: 9876543210  password: owner123')
  console.log('Munim login  → phone: 9876543211  password: munim123')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
