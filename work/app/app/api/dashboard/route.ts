import { desc, eq } from 'drizzle-orm';
import { getDb } from '../../../db';
import { decisions, imports, users } from '../../../db/schema';
import { ensureBamMaster } from '../../../lib/bam-master';
import { readPrivateJson } from '../../../lib/blob-store';
import { jsonError, requireAppUser } from '../../../lib/store';

export async function GET(request: Request) {
  try {
    const user = await requireAppUser();
    await ensureBamMaster();
    const db = getDb();
    const importRecords = await db.select({
      id: imports.id,
      source: imports.source,
      filename: imports.filename,
      row_count: imports.rowCount,
      matched_count: imports.matchedCount,
      review_count: imports.reviewCount,
      orphan_count: imports.orphanCount,
      result_key: imports.resultKey,
      created_at: imports.createdAt,
    }).from(imports).orderBy(desc(imports.createdAt)).limit(30);
    const team = user.role === 'ADMIN'
      ? await db.select({ user_id: users.userId, email: users.email, display_name: users.displayName, role: users.role, system: users.system }).from(users).orderBy(users.createdAt)
      : [];
    const requestedId = new URL(request.url).searchParams.get('importId');
    const latest = requestedId
      ? importRecords.find((item) => item.id === requestedId)
      : importRecords.find((item) => item.source !== 'CRM BAMinds');
    const allRows = latest ? await readPrivateJson<unknown[]>(latest.result_key) : null;
    const rows = allRows?.slice(0, 1000) ?? [];
    const reviewDecisions = latest
      ? await db.select({ row_id: decisions.rowId, crm_code: decisions.crmCode, score: decisions.score, status: decisions.status }).from(decisions).where(eq(decisions.importId, latest.id))
      : [];
    return Response.json({ user, imports: importRecords, users: team, rows, rowTotal: allRows?.length ?? 0, decisions: reviewDecisions, currentImportId: latest?.id ?? null });
  } catch (error) {
    return jsonError(error);
  }
}
