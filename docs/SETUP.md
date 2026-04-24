# Shree Cement House — Developer Setup Guide

## Prerequisites

| Tool       | Version  | Install                                |
|------------|----------|----------------------------------------|
| Node.js    | ≥ 20 LTS | https://nodejs.org                     |
| pnpm       | ≥ 9      | `npm install -g pnpm`                  |
| PostgreSQL | ≥ 16     | https://www.postgresql.org/download/   |
| Redis      | ≥ 7      | https://redis.io/docs/install/         |
| Git        | any      | https://git-scm.com                    |

---

## 1. Clone and install

```bash
git clone https://github.com/your-org/cement-house.git
cd cement-house
pnpm install          # installs all workspaces in one command
```

---

## 2. Set up environment variables

```bash
# Copy the example file — do this for each app
cp .env.example apps/api/.env
cp .env.example apps/worker/.env
cp .env.example apps/web/.env.local
```

Edit `apps/api/.env` and fill in all values.
The most critical ones for local dev:

```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/cement_house"
REDIS_URL="redis://localhost:6379"
JWT_SECRET="any-random-32-char-string-here"
SUPER_ADMIN_SETUP_KEY="set-a-long-random-bootstrap-key"
```

---

## 3. Create the database

```bash
# In PostgreSQL (psql or pgAdmin)
CREATE DATABASE cement_house;
```

---

## 4. Run database migrations and seed

```bash
# Push schema to DB (dev only — no migration files)
pnpm db:push

# Generate the Prisma client
pnpm --filter @cement-house/db generate

# Seed with demo data
pnpm db:seed
```

After seeding, you can log in with:
- **Owner** → phone: `9876543210` · password: `owner123`
- **Munim** → phone: `9876543211` · password: `munim123`

If you want to create the first Super Admin from the UI instead:
- set `SUPER_ADMIN_SETUP_KEY` in `apps/api/.env`
- open `/auth/admin-setup`
- enter the bootstrap key and create the account
- after the first Super Admin exists, this bootstrap flow is disabled

---

## 5. Start all apps in development mode

```bash
# Start everything at once (recommended)
pnpm dev

# OR start individually in separate terminals:
pnpm --filter @cement-house/api    dev   # API on :4000
pnpm --filter @cement-house/web    dev   # Web on :3000
pnpm --filter @cement-house/worker dev   # Worker (no port)
```

Open http://localhost:3000 in your browser.

---

## 6. Inspect the database (optional)

```bash
pnpm db:studio    # Opens Prisma Studio on http://localhost:5555
```

---

## Project structure at a glance

```
cement-house/
├── apps/
│   ├── api/           → Fastify REST API (port 4000)
│   │   └── src/
│   │       ├── routes/       → auth, orders, ledger, inventory, delivery, reports
│   │       ├── middleware/   → JWT auth, RBAC owner guard
│   │       ├── services/     → business logic shared across routes
│   │       └── index.ts      → server entry point
│   │
│   ├── web/           → Next.js 14 frontend (port 3000)
│   │   └── src/
│   │       ├── app/          → Next.js App Router pages
│   │       │   ├── auth/login/
│   │       │   ├── dashboard/
│   │       │   ├── orders/
│   │       │   ├── khata/
│   │       │   ├── customers/
│   │       │   ├── inventory/
│   │       │   ├── delivery/
│   │       │   ├── reports/
│   │       │   └── settings/
│   │       ├── components/   → reusable UI components per domain
│   │       ├── hooks/        → React Query data hooks (useOrders, useLedger …)
│   │       ├── lib/          → api.ts (Axios client), helpers
│   │       └── store/        → Zustand (auth state)
│   │
│   └── worker/        → BullMQ background job processor (no port)
│       └── src/
│           ├── processors/   → reminder, daily-report, stock-alert
│           └── index.ts      → cron scheduler + worker entry
│
├── packages/
│   ├── db/            → Prisma client + schema + seed
│   ├── types/         → shared TypeScript interfaces
│   └── utils/         → formatRupees, WhatsApp templates, helpers
│
├── docs/
│   └── SETUP.md       → this file
│
├── package.json       → pnpm workspace root
├── turbo.json         → Turborepo task pipeline
└── .env.example       → environment variable template
```

---

## Key development commands

| Command                  | What it does                                  |
|--------------------------|-----------------------------------------------|
| `pnpm dev`               | Start all 3 apps in parallel                  |
| `pnpm build`             | Production build of all apps                  |
| `pnpm db:push`           | Sync Prisma schema → PostgreSQL (no migration)|
| `pnpm db:migrate`        | Create a migration file (production workflow) |
| `pnpm db:studio`         | Open Prisma Studio GUI                        |
| `pnpm db:seed`           | Insert demo data                              |
| `pnpm typecheck`         | TypeScript check across all workspaces        |
| `pnpm lint`              | ESLint across all workspaces                  |

---

## Deployment to Railway (production)

1. Push repo to GitHub.
2. Create a new Railway project → "Deploy from GitHub repo".
3. Add three services: `apps/api`, `apps/web`, `apps/worker`.
4. Add PostgreSQL and Redis plugins from Railway marketplace.
5. Set environment variables in Railway dashboard (copy from `.env.example`).
6. Railway auto-deploys on every push to `main`.

Estimated monthly cost: **₹1,500–3,000** for the Hobby plan covering all services.

---

## WhatsApp setup (Meta Cloud API — free tier)

1. Go to https://developers.facebook.com → Create App → Business.
2. Add "WhatsApp" product to the app.
3. Get your **Phone Number ID** and **Access Token** from the dashboard.
4. Add these to your `.env`:
   ```env
   WHATSAPP_PHONE_NUMBER_ID="..."
   WHATSAPP_ACCESS_TOKEN="..."
   ```
5. The free tier allows 1,000 conversations/month at no cost — more than enough for a single distributor.

---

## Adding a new route (example: customers)

```bash
# 1. Create the route file
touch apps/api/src/routes/customers/index.ts

# 2. Register it in apps/api/src/index.ts
import { customerRoutes } from './routes/customers'
app.register(customerRoutes, { prefix: '/api/customers' })

# 3. Add a React Query hook in apps/web/src/hooks/useCustomers.ts

# 4. Build the UI page in apps/web/src/app/customers/page.tsx
```

---

## Common issues

**"Cannot connect to database"**
→ Make sure PostgreSQL is running: `brew services start postgresql` (macOS) or `sudo service postgresql start` (Linux)

**"Redis connection refused"**
→ Start Redis: `brew services start redis` or `redis-server`

**"JWT_SECRET not set"**
→ Check your `apps/api/.env` file exists and has `JWT_SECRET` set

**"Module not found @cement-house/db"**
→ Run `pnpm install` from the root, then `pnpm --filter @cement-house/db generate`

---

## What was built in this session

### Backend — now 100% complete

All 8 API route modules are fully implemented:

| Route                    | Endpoints                                                  |
|--------------------------|------------------------------------------------------------|
| `/api/auth`              | POST login, POST logout                                    |
| `/api/orders`            | GET list, GET :id, POST create, PATCH :id/status           |
| `/api/customers`         | GET list, GET :id, POST create, PATCH :id, PATCH :id/risk  |
| `/api/ledger`            | GET :customerId, GET summary/all, POST payment             |
| `/api/inventory`         | GET list, POST stock-in, POST adjust, GET :id/movements    |
| `/api/delivery`          | GET list, GET :id, POST create, PATCH dispatch/confirm/fail|
| `/api/reminders`         | GET list, POST send, POST bulk                             |
| `/api/reports`           | GET dashboard, GET monthly                                 |

### Frontend — now 90% complete

All 9 pages implemented:

| Page           | File                                   | Status   |
|----------------|----------------------------------------|----------|
| Login          | `app/auth/login/page.tsx`              | Complete |
| Dashboard      | `app/dashboard/page.tsx`               | Complete |
| Orders list    | `app/orders/page.tsx`                  | Complete |
| New order      | `app/orders/new/page.tsx`              | Complete |
| Khata / Ledger | `app/khata/page.tsx`                   | Complete |
| Customers      | `app/customers/page.tsx`               | Complete |
| Inventory      | `app/inventory/page.tsx`               | Complete |
| Delivery       | `app/delivery/page.tsx`                | Complete |
| Reports        | `app/reports/page.tsx`                 | Complete |
| Settings       | `app/settings/page.tsx`                | Complete |

### Remaining (~10%)
- Order detail page (`/orders/[id]`) — view/edit a single order
- PDF challan download (Puppeteer/pdfkit integration)
- WhatsApp API credentials setup (requires Meta developer account)
- Production deployment to Railway
