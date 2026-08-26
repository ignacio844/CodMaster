import { getDb } from '../../../db';
import { decisions } from '../../../db/schema';
import { canReview, jsonError, requireAppUser } from '../../../lib/store';

export async function POST(request: Request) {
  try {
    const user = await requireAppUser();
    if (!canReview(user)) throw new Error('FORBIDDEN');
    const body = await request.json() as { importId: string; rowId: string; source: string; sourceCode: string; crmCode: string; score: number; status: 'Confirmada' | 'Rechazada' };
    if (!body.importId || !body.rowId || !['Confirmada', 'Rechazada'].includes(body.status)) {
      return Response.json({ error: 'INVALID_DATA' }, { status: 400 });
    }
    await getDb().insert(decisions).values({
      id: crypto.randomUUID(),
      importId: body.importId,
      rowId: body.rowId,
      source: body.source,
      sourceCode: body.sourceCode,
      crmCode: body.crmCode,
      score: body.score,
      status: body.status,
      reviewerId: user.userId,
    }).onConflictDoUpdate({
      target: [decisions.importId, decisions.rowId],
      set: { crmCode: body.crmCode, score: body.score, status: body.status, reviewerId: user.userId, updatedAt: new Date() },
    });
    return Response.json({ success: true });
  } catch (error) {
    return jsonError(error);
  }
}
