import { eq } from 'drizzle-orm';
import { getDb } from '../../../db';
import { decisions, imports } from '../../../db/schema';
import { readPrivateJson } from '../../../lib/blob-store';
import { jsonError, requireAppUser } from '../../../lib/store';

export async function GET(request: Request) {
  try {
    await requireAppUser();
    const params = new URL(request.url).searchParams;
    const importId = params.get('importId');
    const offset = Math.max(0, Number(params.get('offset') ?? 0));
    const limit = Math.min(1000, Math.max(1, Number(params.get('limit') ?? 1000)));
    if (!importId) return Response.json({ error: 'IMPORT_REQUIRED' }, { status: 400 });

    const db = getDb();
    const [record] = await db.select({ resultKey: imports.resultKey, source: imports.source }).from(imports).where(eq(imports.id, importId)).limit(1);
    if (!record || record.source === 'CRM BAMinds') return Response.json({ error: 'IMPORT_NOT_FOUND' }, { status: 404 });
    const allRows = await readPrivateJson<Array<Record<string, unknown>>>(record.resultKey);
    if (!allRows) return Response.json({ error: 'RESULT_NOT_FOUND' }, { status: 404 });
    const reviewDecisions = await db.select({ row_id: decisions.rowId, crm_code: decisions.crmCode, score: decisions.score, status: decisions.status }).from(decisions).where(eq(decisions.importId, importId));
    const byRow = new Map(reviewDecisions.map((item) => [item.row_id, item]));
    const rows = allRows.slice(offset, offset + limit).map((row) => {
      const decision = byRow.get(String(row.id));
      return decision ? { ...row, crmCode: decision.crm_code, score: decision.score, status: decision.status } : row;
    });
    return Response.json({ rows, total: allRows.length, offset, hasMore: offset + rows.length < allRows.length });
  } catch (error) {
    return jsonError(error);
  }
}
