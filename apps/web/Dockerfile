# ─────────────────────────────────────────────────────────────
# Cement House — Web Frontend (Next.js 14)
# Build context: repository root (.)
# ─────────────────────────────────────────────────────────────

FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
RUN apk add --no-cache libc6-compat
WORKDIR /app

# ── Stage 1: Install dependencies (cached layer) ────────────
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./
COPY apps/web/package.json          ./apps/web/
COPY apps/api/package.json          ./apps/api/
COPY apps/worker/package.json       ./apps/worker/
COPY packages/db/package.json       ./packages/db/
COPY packages/utils/package.json    ./packages/utils/
COPY packages/types/package.json    ./packages/types/
RUN pnpm install --frozen-lockfile

# ── Stage 2: Build Next.js (standalone output) ──────────────
FROM base AS builder
COPY --from=deps /app/ ./
COPY packages/ ./packages/
COPY apps/web/ ./apps/web/

# NEXT_PUBLIC_ env vars must be set at BUILD time
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN pnpm --filter @cement-house/web build

# ── Stage 3: Production runner ──────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Next.js standalone output copies only what's needed
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static     ./apps/web/.next/static
COPY --from=builder /app/apps/web/public            ./apps/web/public

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "apps/web/server.js"]
