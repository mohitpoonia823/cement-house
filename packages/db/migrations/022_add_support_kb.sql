-- ============================================================
-- 022: Support assistant knowledge base
--
-- Moves the AI support assistant's FAQ knowledge out of hardcoded API source
-- and into an editable table the Super Admin manages without a deploy. Each row
-- is one FAQ/knowledge entry; the assistant concatenates published entries as
-- grounding context. If the table is empty the API falls back to its built-in
-- knowledge base.
--
-- Idempotent: safe to re-run (db-sync replays all migrations).
-- ============================================================

CREATE TABLE IF NOT EXISTS support_kb_entries (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT,
  is_published BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS support_kb_entries_published_idx
  ON support_kb_entries (is_published, sort_order ASC, created_at ASC);
