# ─────────────────────────────────────────────────────────────
# Cement House — API Server (Fastify)
# Build context: repository root (.)
# ─────────────────────────────────────────────────────────────

FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

# ── Stage 1: Install dependencies (cached layer) ────────────
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./
COPY apps/api/package.json          ./apps/api/
COPY apps/worker/package.json       ./apps/worker/
COPY packages/db/package.json       ./packages/db/
COPY packages/utils/package.json    ./packages/utils/
COPY packages/types/package.json    ./packages/types/
RUN pnpm install --frozen-lockfile

# ── Stage 2: Build ──────────────────────────────────────────
FROM base AS builder
COPY --from=deps /app/ ./
COPY packages/ ./packages/
COPY apps/api/ ./apps/api/
# Generate Prisma client
RUN pnpm --filter @cement-house/db exec prisma generate

# ── Stage 3: Production runner ──────────────────────────────
FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app

COPY --from=builder /app/ ./

EXPOSE 4000
CMD ["pnpm", "--filter", "@cement-house/api", "exec", "tsx", "src/index.ts"]
