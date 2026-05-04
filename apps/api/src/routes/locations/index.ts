import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { multiLocationRepository } from '@cement-house/db'
import { getBizId } from '../../middleware/auth'

const LocationTypeSchema = z.enum(['STORE', 'GODOWN', 'WAREHOUSE', 'YARD'])

const CreateLocationSchema = z.object({
  name: z.string().trim().min(2).max(80),
  type: LocationTypeSchema.default('STORE'),
  address: z.string().trim().max(250).optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
})

const UpdateLocationSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  type: LocationTypeSchema.optional(),
  address: z.string().trim().max(250).nullable().optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
})

const LocationParamsSchema = z.object({
  id: z.string().uuid(),
})

export async function locationRoutes(app: FastifyInstance) {
  app.get('/', async (req) => {
    const businessId = getBizId(req)
    const locations = await multiLocationRepository.listLocations(businessId)
    return { success: true, data: locations }
  })

  app.post('/', async (req, reply) => {
    const user = req.user as { role?: string }
    if (user.role !== 'OWNER' && user.role !== 'SUPER_ADMIN') {
      return reply.status(403).send({ success: false, error: 'Only owner/admin can manage locations' })
    }
    const businessId = getBizId(req)
    const body = CreateLocationSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.message })

    const location = await multiLocationRepository.createLocation({
      businessId,
      ...body.data,
    })
    return { success: true, data: location }
  })

  app.patch('/:id', async (req, reply) => {
    const user = req.user as { role?: string }
    if (user.role !== 'OWNER' && user.role !== 'SUPER_ADMIN') {
      return reply.status(403).send({ success: false, error: 'Only owner/admin can manage locations' })
    }
    const businessId = getBizId(req)
    const params = LocationParamsSchema.safeParse(req.params)
    const body = UpdateLocationSchema.safeParse(req.body)
    if (!params.success) return reply.status(400).send({ success: false, error: params.error.message })
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.message })

    const location = await multiLocationRepository.updateLocation({
      businessId,
      locationId: params.data.id,
      ...body.data,
    })
    return { success: true, data: location }
  })
}
