import type { FastifyInstance } from 'fastify'
import { z }         from 'zod'
import bcrypt        from 'bcryptjs'
import { prisma }    from '@cement-house/db'

const LoginSchema = z.object({
  phone:    z.string().min(10).max(10),
  password: z.string().min(6),
})

const RegisterSchema = z.object({
  name:         z.string().min(2),
  phone:        z.string().min(10).max(10),
  password:     z.string().min(6),
  role:         z.enum(['OWNER', 'MUNIM']).default('OWNER'),
  businessName: z.string().min(2),
  city:         z.string().min(2),
})

export async function authRoutes(app: FastifyInstance) {
  // POST /api/auth/login
  app.post('/login', async (req, reply) => {
    const body = LoginSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: 'Invalid input' })

    const user = await prisma.user.findUnique({
      where: { phone: body.data.phone },
      include: { business: true },
    })
    if (!user || !user.isActive) return reply.status(401).send({ success: false, error: 'Invalid credentials' })

    const valid = await bcrypt.compare(body.data.password, user.passwordHash)
    if (!valid) return reply.status(401).send({ success: false, error: 'Invalid credentials' })

    const token = app.jwt.sign({
      id: user.id,
      name: user.name,
      role: user.role,
      businessId: user.businessId,
      businessName: user.business.name,
      businessCity: user.business.city,
      permissions: user.permissions,
    }, { expiresIn: '7d' })

    return { success: true, data: {
      token,
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
        businessId: user.businessId,
        businessName: user.business.name,
        businessCity: user.business.city,
        permissions: user.permissions,
      }
    }}
  })

  // POST /api/auth/register
  app.post('/register', async (req, reply) => {
    const body = RegisterSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: 'Invalid input' })

    // Check if phone already exists
    const existing = await prisma.user.findUnique({ where: { phone: body.data.phone } })
    if (existing) return reply.status(409).send({ success: false, error: 'An account with this phone number already exists' })

    const passwordHash = await bcrypt.hash(body.data.password, 10)

    // Create Business + User in a transaction
    const { business, user } = await prisma.$transaction(async (tx) => {
      const business = await tx.business.create({
        data: {
          name: body.data.businessName,
          city: body.data.city,
        },
      })

      const user = await tx.user.create({
        data: {
          name:         body.data.name,
          phone:        body.data.phone,
          role:         body.data.role,
          passwordHash,
          businessId:   business.id,
        },
      })

      return { business, user }
    })

    const token = app.jwt.sign({
      id: user.id,
      name: user.name,
      role: user.role,
      businessId: business.id,
      businessName: business.name,
      businessCity: business.city,
      permissions: user.permissions,
    }, { expiresIn: '7d' })

    return { success: true, data: {
      token,
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
        businessId: business.id,
        businessName: business.name,
        businessCity: business.city,
        permissions: user.permissions,
      }
    }}
  })

  // POST /api/auth/logout  (client-side token deletion; stateless)
  app.post('/logout', async () => ({ success: true }))
}
