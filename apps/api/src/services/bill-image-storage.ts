import { randomUUID } from 'node:crypto'

export interface StoredBillImageRef {
  provider: 'supabase'
  bucket: string
  objectPath: string
  mimeType: string
  sizeBytes: number
  originalFileName: string | null
}

export interface SupabaseStoredObject {
  objectPath: string
  sizeBytes: number | null
  updatedAt: string | null
}

function ensureSupabaseConfig() {
  const baseUrl = process.env.SUPABASE_URL?.trim()
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  const bucket = process.env.SUPABASE_BILL_BUCKET?.trim() || 'bill-scans'
  if (!baseUrl || !serviceKey) return null
  return { baseUrl: baseUrl.replace(/\/+$/, ''), serviceKey, bucket }
}

function extFromMime(mimeType: string) {
  if (mimeType === 'image/png') return 'png'
  if (mimeType === 'image/webp') return 'webp'
  return 'jpg'
}

function buildObjectPath(input: { businessId: string; imageSha256: string; mimeType: string }) {
  const ext = extFromMime(input.mimeType)
  const month = new Date().toISOString().slice(0, 7)
  return `${input.businessId}/${month}/${input.imageSha256}-${randomUUID()}.${ext}`
}

function encodeObjectPath(path: string) {
  return path.split('/').map((segment) => encodeURIComponent(segment)).join('/')
}

export async function uploadBillImageIfConfigured(input: {
  businessId: string
  imageSha256: string
  mimeType: string
  bytes: Buffer
  originalFileName?: string | null
}) {
  const cfg = ensureSupabaseConfig()
  if (!cfg) return null

  const objectPath = buildObjectPath({
    businessId: input.businessId,
    imageSha256: input.imageSha256,
    mimeType: input.mimeType,
  })

  const uploadUrl = `${cfg.baseUrl}/storage/v1/object/${encodeURIComponent(cfg.bucket)}/${encodeObjectPath(objectPath)}`
  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      apikey: cfg.serviceKey,
      authorization: `Bearer ${cfg.serviceKey}`,
      'content-type': input.mimeType,
      'x-upsert': 'false',
    },
    body: input.bytes,
  })

  if (!response.ok) {
    const reason = await response.text().catch(() => '')
    throw new Error(`Supabase upload failed (${response.status}): ${reason || 'unknown error'}`)
  }

  return {
    provider: 'supabase',
    bucket: cfg.bucket,
    objectPath,
    mimeType: input.mimeType,
    sizeBytes: input.bytes.byteLength,
    originalFileName: input.originalFileName ?? null,
  } satisfies StoredBillImageRef
}

export async function downloadBillImageFromStorage(input: {
  provider: string | null
  bucket: string | null
  objectPath: string | null
}) {
  if (input.provider !== 'supabase' || !input.bucket || !input.objectPath) return null
  const cfg = ensureSupabaseConfig()
  if (!cfg) return null

  const downloadUrl = `${cfg.baseUrl}/storage/v1/object/${encodeURIComponent(input.bucket)}/${encodeObjectPath(input.objectPath)}`
  const response = await fetch(downloadUrl, {
    method: 'GET',
    headers: {
      apikey: cfg.serviceKey,
      authorization: `Bearer ${cfg.serviceKey}`,
    },
  })

  if (!response.ok) {
    const reason = await response.text().catch(() => '')
    throw new Error(`Supabase download failed (${response.status}): ${reason || 'unknown error'}`)
  }

  const mimeType = response.headers.get('content-type') || 'application/octet-stream'
  const bytes = Buffer.from(await response.arrayBuffer())
  return { mimeType, bytes }
}

export async function deleteBillImageFromStorage(input: {
  provider: string | null
  bucket: string | null
  objectPath: string | null
}) {
  if (input.provider !== 'supabase' || !input.bucket || !input.objectPath) return
  const cfg = ensureSupabaseConfig()
  if (!cfg) return

  const deleteUrl = `${cfg.baseUrl}/storage/v1/object/${encodeURIComponent(input.bucket)}/${encodeObjectPath(input.objectPath)}`
  const response = await fetch(deleteUrl, {
    method: 'DELETE',
    headers: {
      apikey: cfg.serviceKey,
      authorization: `Bearer ${cfg.serviceKey}`,
    },
  })

  if (!response.ok && response.status !== 404) {
    const reason = await response.text().catch(() => '')
    throw new Error(`Supabase delete failed (${response.status}): ${reason || 'unknown error'}`)
  }
}

async function listSupabaseObjectsAtPrefix(input: {
  bucket: string
  prefix: string
  limit?: number
}) {
  const cfg = ensureSupabaseConfig()
  if (!cfg) return { files: [] as SupabaseStoredObject[], folders: [] as string[] }
  const listUrl = `${cfg.baseUrl}/storage/v1/object/list/${encodeURIComponent(input.bucket)}`
  const response = await fetch(listUrl, {
    method: 'POST',
    headers: {
      apikey: cfg.serviceKey,
      authorization: `Bearer ${cfg.serviceKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      prefix: input.prefix,
      limit: input.limit ?? 1000,
      offset: 0,
      sortBy: { column: 'name', order: 'asc' },
    }),
  })
  if (!response.ok) {
    const reason = await response.text().catch(() => '')
    throw new Error(`Supabase list failed (${response.status}): ${reason || 'unknown error'}`)
  }
  const rows = (await response.json().catch(() => [])) as Array<any>
  const files: SupabaseStoredObject[] = []
  const folders: string[] = []
  for (const row of rows) {
    const name = typeof row?.name === 'string' ? row.name.trim() : ''
    if (!name) continue
    const hasNested = typeof row?.id !== 'string' || row?.id.length === 0
    if (hasNested) {
      folders.push(name)
      continue
    }
    const objectPath = `${input.prefix.replace(/\/+$/, '')}/${name}`.replace(/^\/+/, '')
    const sizeBytes = Number.isFinite(Number(row?.metadata?.size)) ? Number(row.metadata.size) : null
    const updatedAt = typeof row?.updated_at === 'string' ? row.updated_at : null
    files.push({ objectPath, sizeBytes, updatedAt })
  }
  return { files, folders }
}

export async function listBillImagesForBusiness(input: { businessId: string; bucket?: string | null }) {
  const cfg = ensureSupabaseConfig()
  if (!cfg) return { provider: 'supabase' as const, bucket: null, objects: [] as SupabaseStoredObject[] }
  const bucket = (input.bucket?.trim() || cfg.bucket).trim()
  const rootPrefix = input.businessId.trim()
  if (!rootPrefix) return { provider: 'supabase' as const, bucket, objects: [] as SupabaseStoredObject[] }

  const queue = [rootPrefix]
  const seen = new Set<string>()
  const objects: SupabaseStoredObject[] = []

  while (queue.length > 0) {
    const prefix = queue.shift()!
    if (seen.has(prefix)) continue
    seen.add(prefix)

    const page = await listSupabaseObjectsAtPrefix({ bucket, prefix })
    objects.push(...page.files)
    for (const folder of page.folders) {
      const nextPrefix = `${prefix.replace(/\/+$/, '')}/${folder.replace(/^\/+/, '')}`
      if (!seen.has(nextPrefix)) queue.push(nextPrefix)
    }
  }

  return { provider: 'supabase' as const, bucket, objects }
}
