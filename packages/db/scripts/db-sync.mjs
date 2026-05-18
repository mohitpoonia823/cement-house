import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const dbPkgDir = path.resolve(__dirname, '..')
const schemaPath = path.join(dbPkgDir, 'prisma', 'schema.prisma')

function run(command, args) {
  const cmdText = `${command} ${args.join(' ')}`
  console.log(`\n> ${cmdText}`)
  const result = spawnSync(command, args, {
    cwd: dbPkgDir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

run('prisma', ['migrate', 'dev'])

const sqlMigrations = [
  '011_add_plan_subscription_system.sql',
  '013_add_super_admin_dashboard_indexes.sql',
  '015_add_state_code_fields.sql',
]

for (const migrationFile of sqlMigrations) {
  const fullPath = path.join(dbPkgDir, 'migrations', migrationFile)
  run('prisma', ['db', 'execute', '--schema', schemaPath, '--file', fullPath])
}

console.log('\nDB sync complete.')
