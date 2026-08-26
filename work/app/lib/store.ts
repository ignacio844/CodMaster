import { eq, sql } from 'drizzle-orm';
import { ALLOWED_EMAILS } from '../config/allowed-emails';
import { getDb } from '../db';
import { users } from '../db/schema';
import { getGoogleUser } from './google-auth';

export type AppRole = 'ADMIN' | 'RESPONSIBLE' | 'REVIEWER' | 'VIEWER';
export type AppUser = { userId: string; email: string; displayName: string; role: AppRole; system: string | null };

let schemaReady: Promise<void> | null = null;

export function ensureDatabase() {
  schemaReady ??= (async () => {
    const db = getDb();
    await db.execute(sql`CREATE TABLE IF NOT EXISTS users (
      user_id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'VIEWER',
      system TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    await db.execute(sql`CREATE TABLE IF NOT EXISTS imports (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      filename TEXT NOT NULL,
      uploader_id TEXT NOT NULL,
      row_count INTEGER NOT NULL,
      matched_count INTEGER NOT NULL,
      review_count INTEGER NOT NULL,
      orphan_count INTEGER NOT NULL,
      object_key TEXT NOT NULL,
      result_key TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    await db.execute(sql`CREATE TABLE IF NOT EXISTS decisions (
      id TEXT PRIMARY KEY,
      import_id TEXT NOT NULL,
      row_id TEXT NOT NULL,
      source TEXT NOT NULL,
      source_code TEXT NOT NULL,
      crm_code TEXT NOT NULL,
      score INTEGER NOT NULL,
      status TEXT NOT NULL,
      reviewer_id TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT decision_import_row_unique UNIQUE(import_id, row_id)
    )`);
    await db.execute(sql`CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS imports_created_idx ON imports(created_at DESC)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS decisions_import_idx ON decisions(import_id)`);
  })();
  return schemaReady;
}

export async function requireAppUser(): Promise<AppUser> {
  await ensureDatabase();
  const authUser = await getGoogleUser();
  if (!authUser) throw new Error('UNAUTHENTICATED');

  const db = getDb();
  const [existing] = await db.select().from(users).where(eq(users.email, authUser.email)).limit(1);
  if (!existing) {
    const role: AppRole = authUser.email.toLowerCase() === ALLOWED_EMAILS[0]?.toLowerCase() ? 'ADMIN' : 'VIEWER';
    await db.insert(users).values({ userId: authUser.userId, email: authUser.email, displayName: authUser.displayName, role });
    return { userId: authUser.userId, email: authUser.email, displayName: authUser.displayName, role, system: null };
  }
  return {
    userId: existing.userId,
    email: existing.email,
    displayName: existing.displayName,
    role: existing.role as AppRole,
    system: existing.system,
  };
}

export function canUpload(user: AppUser, source: string) {
  return user.role === 'ADMIN' || (user.role === 'RESPONSIBLE' && (!user.system || user.system === source));
}

export function canReview(user: AppUser) {
  return user.role === 'ADMIN' || user.role === 'REVIEWER';
}

export function jsonError(error: unknown) {
  const message = error instanceof Error ? error.message : 'UNKNOWN';
  const status = message === 'UNAUTHENTICATED'
    ? 401
    : message === 'FORBIDDEN'
      ? 403
      : ['DATABASE_NOT_CONFIGURED', 'BLOB_NOT_CONFIGURED'].includes(message)
        ? 503
        : ['INVALID_UPLOAD', 'INVALID_UPLOAD_PATH'].includes(message)
          ? 400
        : 500;
  return Response.json({ error: message }, { status });
}
