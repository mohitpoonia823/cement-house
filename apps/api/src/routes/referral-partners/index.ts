import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { referralPartnersRepository } from '@cement-house/db'
import { getBizId, requireOwner } from '../../middleware/auth'

const ReferralRewardTypeSchema = z.enum(['FLAT', 'PERCENT'])

const ListQuerySchema = z.object({
  search: z.string().trim().optional(),
})

const IdParamsSchema = z.object({
  id: z.string().uuid(),
})

const CreateSchema = z.object({
  name: z.string().trim().min(2),
  phone: z.string().trim().min(10).max(15),
  role: z.string().trim().min(2),
  area: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  rewardType: ReferralRewardTypeSchema.default('PERCENT'),
  rewardValue: z.number().min(0),
})

const UpdateSchema = CreateSchema.partial().extend({
  isActive: z.boolean().optional(),
})

const StatsQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
})

function parseDate(input?: string) {
  if (!input) return undefined
  const date = new Date(input)
  if (Number.isNaN(date.getTime())) return undefined
  return date
}

export async function referralPartnersRoutes(app: FastifyInstance) {
  app.get('/', async (req, reply) => {
    const bizId = getBizId(req)
    const query = ListQuerySchema.safeParse(req.query)
    if (!query.success) return reply.status(400).send({ success: false, error: query.error.message })

    const items = await referralPartnersRepository.listReferralPartners(bizId, query.data.search)
    return { success: true, data: items }
  })

  app.get('/stats', async (req, reply) => {
    const bizId = getBizId(req)
    const query = StatsQuerySchema.safeParse(req.query)
    if (!query.success) return reply.status(400).send({ success: false, error: query.error.message })

    const leaderboard = await referralPartnersRepository.getReferralLeaderboard({
      businessId: bizId,
      from: parseDate(query.data.from),
      to: parseDate(query.data.to),
    })
    return { success: true, data: leaderboard }
  })

  app.post('/', async (req, reply) => {
    if (!requireOwner(req, reply)) return
    const bizId = getBizId(req)
    const body = CreateSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.message })
    if (body.data.rewardType === 'PERCENT' && body.data.rewardValue > 100) {
      return reply.status(400).send({ success: false, error: 'Percent reward cannot exceed 100' })
    }

    const created = await referralPartnersRepository.createReferralPartner({
      businessId: bizId,
      ...body.data,
    })
    return { success: true, data: created }
  })

  app.patch('/:id', async (req, reply) => {
    if (!requireOwner(req, reply)) return
    const bizId = getBizId(req)
    const params = IdParamsSchema.safeParse(req.params)
    if (!params.success) return reply.status(400).send({ success: false, error: params.error.message })
    const body = UpdateSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.message })
    if (body.data.rewardType === 'PERCENT' && typeof body.data.rewardValue === 'number' && body.data.rewardValue > 100) {
      return reply.status(400).send({ success: false, error: 'Percent reward cannot exceed 100' })
    }

    const updated = await referralPartnersRepository.updateReferralPartner(params.data.id, bizId, body.data)
    if (!updated) return reply.status(404).send({ success: false, error: 'Referral partner not found' })
    return { success: true, data: updated }
  })

  app.delete('/:id', async (req, reply) => {
    if (!requireOwner(req, reply)) return
    const bizId = getBizId(req)
    const params = IdParamsSchema.safeParse(req.params)
    if (!params.success) return reply.status(400).send({ success: false, error: params.error.message })
    await referralPartnersRepository.softDeleteReferralPartner(params.data.id, bizId)
    return { success: true }
  })
}
