import { randomUUID } from 'node:crypto'
import { prisma } from '../client'

export interface SupportKbEntry {
  id: string
  title: string
  content: string
  category: string | null
  isPublished: boolean
  sortOrder: number
  createdAt: Date
  updatedAt: Date
}

let ensureSupportKbTablePromise: Promise<void> | null = null

// Self-heals the table the same way the support tickets repository does, so the
// feature works even before the SQL migration has been run in an environment.
async function ensureSupportKbTable() {
  if (!ensureSupportKbTablePromise) {
    ensureSupportKbTablePromise = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS support_kb_entries (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          content TEXT NOT NULL,
          category TEXT,
          is_published BOOLEAN NOT NULL DEFAULT TRUE,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `)
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS support_kb_entries_published_idx
          ON support_kb_entries (is_published, sort_order ASC, created_at ASC)
      `)
    })().catch((error) => {
      ensureSupportKbTablePromise = null
      throw error
    })
  }
  await ensureSupportKbTablePromise
}

const SELECT_COLUMNS = `
  id,
  title,
  content,
  category,
  is_published AS "isPublished",
  sort_order AS "sortOrder",
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`

export async function listPublishedKbEntries(): Promise<SupportKbEntry[]> {
  await ensureSupportKbTable()
  return prisma.$queryRawUnsafe<SupportKbEntry[]>(`
    SELECT ${SELECT_COLUMNS}
    FROM support_kb_entries
    WHERE is_published = TRUE
    ORDER BY sort_order ASC, created_at ASC
  `)
}

export async function listAllKbEntries(): Promise<SupportKbEntry[]> {
  await ensureSupportKbTable()
  return prisma.$queryRawUnsafe<SupportKbEntry[]>(`
    SELECT ${SELECT_COLUMNS}
    FROM support_kb_entries
    ORDER BY sort_order ASC, created_at ASC
  `)
}

export async function createKbEntry(input: {
  title: string
  content: string
  category?: string | null
  isPublished?: boolean
  sortOrder?: number
}): Promise<SupportKbEntry> {
  await ensureSupportKbTable()
  const id = randomUUID()
  const rows = await prisma.$queryRaw<SupportKbEntry[]>`
    INSERT INTO support_kb_entries (id, title, content, category, is_published, sort_order, created_at, updated_at)
    VALUES (
      ${id},
      ${input.title},
      ${input.content},
      ${input.category ?? null},
      ${input.isPublished ?? true},
      ${input.sortOrder ?? 0},
      NOW(),
      NOW()
    )
    RETURNING
      id,
      title,
      content,
      category,
      is_published AS "isPublished",
      sort_order AS "sortOrder",
      created_at AS "createdAt",
      updated_at AS "updatedAt"
  `
  return rows[0]
}

// Partial update: only fields explicitly provided are changed. `category`
// distinguishes "not provided" (undefined → keep) from "cleared" (null → set).
export async function updateKbEntry(
  id: string,
  input: {
    title?: string
    content?: string
    category?: string | null
    isPublished?: boolean
    sortOrder?: number
  },
): Promise<SupportKbEntry | null> {
  await ensureSupportKbTable()
  const categoryProvided = Object.prototype.hasOwnProperty.call(input, 'category')
  const rows = await prisma.$queryRaw<SupportKbEntry[]>`
    UPDATE support_kb_entries
    SET
      title = COALESCE(${input.title ?? null}, title),
      content = COALESCE(${input.content ?? null}, content),
      category = CASE WHEN ${categoryProvided} THEN ${input.category ?? null} ELSE category END,
      is_published = COALESCE(${input.isPublished ?? null}, is_published),
      sort_order = COALESCE(${input.sortOrder ?? null}, sort_order),
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING
      id,
      title,
      content,
      category,
      is_published AS "isPublished",
      sort_order AS "sortOrder",
      created_at AS "createdAt",
      updated_at AS "updatedAt"
  `
  return rows[0] ?? null
}

export async function deleteKbEntry(id: string): Promise<boolean> {
  await ensureSupportKbTable()
  const count = await prisma.$executeRaw`DELETE FROM support_kb_entries WHERE id = ${id}`
  return count > 0
}

// Inserts starter entries whose title does not already exist. Idempotent —
// re-running never duplicates. Returns how many were newly inserted.
export async function seedKbEntriesIfMissing(
  entries: Array<{ title: string; content: string; category?: string | null }>,
): Promise<{ inserted: number }> {
  await ensureSupportKbTable()
  const existing = await prisma.$queryRaw<Array<{ title: string }>>`
    SELECT title FROM support_kb_entries
  `
  const existingTitles = new Set(existing.map((row) => row.title.trim().toLowerCase()))

  let inserted = 0
  let sortOrder = 0
  for (const entry of entries) {
    sortOrder += 10
    const key = entry.title.trim().toLowerCase()
    if (existingTitles.has(key)) continue
    existingTitles.add(key) // guard against duplicate titles within this same batch
    await prisma.$executeRaw`
      INSERT INTO support_kb_entries (id, title, content, category, is_published, sort_order, created_at, updated_at)
      VALUES (
        ${randomUUID()},
        ${entry.title},
        ${entry.content},
        ${entry.category ?? null},
        TRUE,
        ${sortOrder},
        NOW(),
        NOW()
      )
    `
    inserted += 1
  }
  return { inserted }
}
