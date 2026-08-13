/**
 * Bundles the API into a single Vercel function: api/index.js
 *
 * Why bundle at all? The workspace packages (@cement-house/db|utils|types)
 * publish raw TypeScript — their `exports` field points straight at
 * ./src/index.ts. Locally and in Docker that is fine because everything runs
 * through tsx. Vercel's runtime is plain Node, which cannot import a .ts file,
 * so a per-file compile of apps/api alone leaves dangling imports:
 *
 *   Cannot find module '.../@cement-house/db/src/index.ts'
 *     imported from '.../apps/api/src/app.js'
 *
 * esbuild resolves those three packages to their sources and inlines them, so
 * the deployed artifact has no unresolved workspace imports and no reliance on
 * Node's ESM extension rules. Keeping the packages source-only also keeps
 * `pnpm dev` instant — no build step between editing a package and seeing it.
 *
 * Everything in node_modules stays external and is traced by Vercel as usual.
 * That matters most for @prisma/client, which must load its generated client
 * and native query engine from disk rather than from a bundle, and for pdfkit,
 * which reads font metrics via `__dirname + '/data/*.afm'`.
 */
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { writeFile } from 'node:fs/promises'

const here = dirname(fileURLToPath(import.meta.url))
const apiRoot = resolve(here, '..')
const repoRoot = resolve(apiRoot, '..', '..')

const workspaceSrc = (name) => resolve(repoRoot, 'packages', name, 'src', 'index.ts')

await build({
  entryPoints: [resolve(apiRoot, 'src', 'serverless.ts')],
  // Emitted under dist/, not api/. api/index.ts is committed so Vercel's
  // function detection (which reads the source tree, not build output) always
  // finds it; that file re-exports this bundle by explicit .js path.
  outfile: resolve(apiRoot, 'dist', 'vercel', 'index.js'),
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  sourcemap: true,
  logLevel: 'info',
  // Bare specifiers stay external (Vercel traces them); the three aliases below
  // are rewritten to absolute source paths first, so they get bundled instead.
  packages: 'external',
  alias: {
    '@cement-house/db': workspaceSrc('db'),
    '@cement-house/utils': workspaceSrc('utils'),
    '@cement-house/types': workspaceSrc('types'),
  },
  // esbuild emits ESM, but some transitive CJS deps expect these to exist.
  banner: {
    js: [
      "import { createRequire as __createRequire } from 'node:module'",
      'const require = __createRequire(import.meta.url)',
    ].join('\n'),
  },
})

// api/index.ts is typechecked by Vercel, and a bare .js import with no
// declarations is a compile error there. Ship types next to the bundle.
await writeFile(
  resolve(apiRoot, 'dist', 'vercel', 'index.d.ts'),
  [
    "import type { IncomingMessage, ServerResponse } from 'node:http'",
    'declare const handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>',
    'export default handler',
    '',
  ].join('\n'),
)

console.log('[build-vercel] bundled dist/vercel/index.js (+ index.d.ts)')
