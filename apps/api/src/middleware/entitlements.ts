import type { FastifyReply, FastifyRequest } from 'fastify'
import type { FeatureKey, ModuleKey } from '@cement-house/utils'
import type { Entitlements } from '../services/entitlements'

type EntitledUser = {
  role?: string
  enabledModules?: unknown
  featureFlags?: unknown
  entitlements?: Entitlements
}

export function getEntitlements(req: FastifyRequest): Entitlements | null {
  return (req.user as EntitledUser | undefined)?.entitlements ?? null
}

/**
 * onRequest guard: the business must have at least one of the given modules
 * enabled. Runs after `authenticate` (which resolves entitlements), so the
 * check is a plain in-memory lookup. SUPER_ADMIN bypasses module gates.
 */
export function requireModule(moduleKeys: ModuleKey | ModuleKey[]) {
  const keys = Array.isArray(moduleKeys) ? moduleKeys : [moduleKeys]
  return async function moduleGuard(req: FastifyRequest, reply: FastifyReply) {
    const user = req.user as EntitledUser | undefined
    if (!user) {
      return reply.status(401).send({ success: false, error: 'Unauthorised' })
    }
    if (user.role === 'SUPER_ADMIN') return
    const modules = Array.isArray(user.enabledModules) ? (user.enabledModules as string[]) : []
    if (keys.some((key) => modules.includes(key))) return
    return reply.status(403).send({
      success: false,
      code: 'MODULE_DISABLED',
      error: 'This module is not enabled for your business. An owner can enable it from Settings.',
      data: { requiredModules: keys },
    })
  }
}

/** onRequest guard: the business must have at least one of the given feature flags on. */
export function requireFeature(featureKeys: FeatureKey | FeatureKey[]) {
  const keys = Array.isArray(featureKeys) ? featureKeys : [featureKeys]
  return async function featureGuard(req: FastifyRequest, reply: FastifyReply) {
    const user = req.user as EntitledUser | undefined
    if (!user) {
      return reply.status(401).send({ success: false, error: 'Unauthorised' })
    }
    if (user.role === 'SUPER_ADMIN') return
    const flags =
      user.featureFlags && typeof user.featureFlags === 'object' && !Array.isArray(user.featureFlags)
        ? (user.featureFlags as Record<string, unknown>)
        : {}
    if (keys.some((key) => flags[key] === true)) return
    return reply.status(403).send({
      success: false,
      code: 'FEATURE_DISABLED',
      error: 'This feature is not enabled for your business. An owner can enable it from Settings.',
      data: { requiredFeatures: keys },
    })
  }
}
