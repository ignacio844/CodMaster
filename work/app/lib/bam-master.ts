import { put } from '@vercel/blob';
import { eq } from 'drizzle-orm';
import bamMaster from '../data/bam-master.json';
import { getDb } from '../db';
import { imports, settings } from '../db/schema';
import { ensureDatabase } from './store';

const SEED_VERSION = 'bam-master-2026-08-25-v1';
const MASTER_ID = 'bam-master-2026-08-25';
const MASTER_KEY = `seed/${MASTER_ID}.json`;

export type BamProduct = { code: string; alternativeCode: string; brand: string; description: string; active: boolean; activeWeb: boolean };

export async function ensureBamMaster() {
  await ensureDatabase();
  const db = getDb();
  const [current] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, 'bam_seed_version')).limit(1);
  if (current?.value === SEED_VERSION) return;
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error('BLOB_NOT_CONFIGURED');

  const payload = JSON.stringify({
    sourceFilename: bamMaster.sourceFilename,
    sheet: bamMaster.sheet,
    codeColumn: bamMaster.codeColumn,
    sourceRows: bamMaster.sourceRows,
    products: bamMaster.products,
  });
  await put(MASTER_KEY, payload, {
    access: 'private',
    allowOverwrite: true,
    contentType: 'application/json',
    cacheControlMaxAge: 86400,
  });

  await db.insert(imports).values({
    id: MASTER_ID,
    source: 'CRM BAMinds',
    filename: bamMaster.sourceFilename,
    uploaderId: 'system-seed',
    rowCount: bamMaster.products.length,
    matchedCount: 0,
    reviewCount: 0,
    orphanCount: 0,
    objectKey: MASTER_KEY,
    resultKey: MASTER_KEY,
  }).onConflictDoUpdate({
    target: imports.id,
    set: {
      filename: bamMaster.sourceFilename,
      rowCount: bamMaster.products.length,
      objectKey: MASTER_KEY,
      resultKey: MASTER_KEY,
    },
  });
  await db.insert(settings).values({ key: 'master_key', value: MASTER_KEY }).onConflictDoUpdate({
    target: settings.key,
    set: { value: MASTER_KEY, updatedAt: new Date() },
  });
  await db.insert(settings).values({ key: 'bam_seed_version', value: SEED_VERSION }).onConflictDoUpdate({
    target: settings.key,
    set: { value: SEED_VERSION, updatedAt: new Date() },
  });
}
