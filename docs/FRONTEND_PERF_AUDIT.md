# Frontend Performance Audit

Generated from `.next/app-build-manifest.json` and static chunk sizes.

## Approx route payload (shared + route chunks)

- /settings/page: ~486.2 KB
- /dashboard/page: ~478.2 KB
- /inventory/page: ~468.9 KB
- /customers/page: ~467.4 KB
- /orders/page: ~466.5 KB

## Largest JS chunks

- `static/chunks/308.a44a9f89f72fe67b.js`: ~408.6 KB
- `static/chunks/65d48fa5-4bccc82f1e58c67d.js`: ~168.8 KB
- `framework-e2992f489174322a.js`: ~137.7 KB
- `static/chunks/801-eb69fa406c33eaad.js`: ~120.6 KB
- `main-0192f2659080e81c.js`: ~108.3 KB

## Identified causes

- Heavy chart code in dashboard (`recharts`) was bundled with dashboard page code.
- New order form code and dependencies loaded directly in orders list page for mobile modal.
- Form sections rendered before lookup data (customers/materials), causing mobile layout shift.

## Implemented fixes

- Dynamic import split for dashboard chart components (`recharts`) with skeleton fallbacks.
- Dynamic import split for mobile modal new-order form in `/orders`.
- Added stable loading skeletons to new-order form while lookups are loading.
- Added Suspense wrapper for `/orders` page to avoid prerender/search-param CSR bailout.

## Build note

- Build completes compile + static generation successfully.
- Fails at standalone tracing symlink stage on this Windows environment (`EPERM symlink`).
