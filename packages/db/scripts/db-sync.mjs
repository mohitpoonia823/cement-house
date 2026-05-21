import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
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

run('prisma', ['migrate', 'deploy'])

const sqlMigrationsDir = path.join(dbPkgDir, 'migrations')
const sqlMigrations = fs
  .readdirSync(sqlMigrationsDir)
  .filter((file) => /^\d+_.+\.sql$/i.test(file))
  .sort((a, b) => a.localeCompare(b))

for (const migrationFile of sqlMigrations) {
  const fullPath = path.join(sqlMigrationsDir, migrationFile)
  run('prisma', ['db', 'execute', '--schema', schemaPath, '--file', fullPath])
}

run('node', [path.join(dbPkgDir, 'scripts', 'verify-schema.mjs')])
console.log('\nDB sync complete and verified.')
