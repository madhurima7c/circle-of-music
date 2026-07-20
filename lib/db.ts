import { neon } from '@neondatabase/serverless';

/**
 * Neon Postgres (Vercel Marketplace) — stores every contact-form submission
 * (notes + song suggestions). Anonymous by design: no user identifiers are
 * ever written, only what the form itself contains.
 *
 * Lazy init so `next build` (and any environment without DATABASE_URL, e.g.
 * before the integration is provisioned) never crashes — callers get null
 * and skip persistence gracefully.
 */

type Sql = ReturnType<typeof neon>;

let _sql: Sql | null = null;

export function getSql(): Sql | null {
  if (_sql) return _sql;
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  _sql = neon(url);
  return _sql;
}

let _ready = false;

/** Create the submissions table on first use (idempotent). */
async function ensureSchema(sql: Sql) {
  if (_ready) return;
  await sql`
    CREATE TABLE IF NOT EXISTS submissions (
      id         serial PRIMARY KEY,
      kind       text NOT NULL,
      subject    text NOT NULL DEFAULT '',
      message    text NOT NULL,
      country    text,
      genre      text,
      song       text,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  _ready = true;
}

export type Submission = {
  kind: 'note' | 'song';
  subject: string;
  message: string;
  country?: string | null;
  genre?: string | null;
  song?: string | null;
};

/**
 * Insert a submission. Returns true on success, false when the DB is not
 * configured or the insert failed — persistence must never block the email
 * relay, so callers treat false as a soft failure.
 */
export async function storeSubmission(s: Submission): Promise<boolean> {
  const sql = getSql();
  if (!sql) return false;
  try {
    await ensureSchema(sql);
    await sql`
      INSERT INTO submissions (kind, subject, message, country, genre, song)
      VALUES (${s.kind}, ${s.subject}, ${s.message},
              ${s.country ?? null}, ${s.genre ?? null}, ${s.song ?? null})
    `;
    return true;
  } catch {
    return false;
  }
}
