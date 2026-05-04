import { createHmac } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { Prisma, subscriptionsRepository } from '@cement-house/db'

type RawBodyRequest = { rawBody?: string }

function verifyRazorpayWebhook(rawBody: string, signature: string, secret: string) {
  const digest = createHmac('sha256', secret).update(rawBody).digest('hex')
  return digest === signature
}

export async function razorpayWebhookRoutes(app: FastifyInstance) {
  app.removeAllContentTypeParsers()
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    const raw = typeof body === 'string' ? body : body.toString('utf8')
    ;(req as unknown as RawBodyRequest).rawBody = raw
    try {
      done(null, JSON.parse(raw))
    } catch (error) {
      done(error as Error, undefined)
    }
  })

  app.post('/razorpay', async (req, reply) => {
    const signature = String(req.headers['x-razorpay-signature'] ?? '')
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET?.trim() || ''
    if (!secret) return reply.status(503).send({ success: false, error: 'Webhook secret not configured' })
    if (!signature) return reply.status(400).send({ success: false, error: 'Missing signature' })
    const rawBody = (req as unknown as RawBodyRequest).rawBody ?? ''
    if (!rawBody) return reply.status(400).send({ success: false, error: 'Missing webhook body' })
    if (!verifyRazorpayWebhook(rawBody, signature, secret)) {
      return reply.status(401).send({ success: false, error: 'Invalid signature' })
    }

    const event = (req.body ?? {}) as any
    const eventType = String(event?.event ?? '')
    if (eventType !== 'payment.captured' && eventType !== 'payment.failed') {
      return { success: true, ignored: true }
    }

    const entity = event?.payload?.payment?.entity ?? {}
    const razorpayOrderId = typeof entity.order_id === 'string' ? entity.order_id : null
    const razorpayPaymentId = typeof entity.id === 'string' ? entity.id : null
    const eventId =
      typeof event?.id === 'string' && event.id.trim()
        ? event.id.trim()
        : `${eventType}:${razorpayOrderId ?? 'no_order'}:${razorpayPaymentId ?? 'no_payment'}`

    const payload = JSON.parse(JSON.stringify(req.body ?? {})) as Prisma.JsonObject
    const result = await subscriptionsRepository.processRazorpayWebhookEvent({
      eventId,
      eventType,
      razorpayOrderId,
      razorpayPaymentId,
      payload,
    })
    return { success: true, data: result }
  })
}
