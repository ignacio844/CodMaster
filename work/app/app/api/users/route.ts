import { eq } from 'drizzle-orm';
import { getDb } from '../../../db';
import { users } from '../../../db/schema';
import { jsonError, requireAppUser, type AppRole } from '../../../lib/store';

export async function PATCH(request: Request) {
  try {
    const user = await requireAppUser();
    if (user.role !== 'ADMIN') throw new Error('FORBIDDEN');
    const body = await request.json() as { userId: string; role: AppRole; system: string | null };
    if (!body.userId || !['ADMIN', 'RESPONSIBLE', 'REVIEWER', 'VIEWER'].includes(body.role)) {
      return Response.json({ error: 'INVALID_ROLE' }, { status: 400 });
    }
    await getDb().update(users).set({ role: body.role, system: body.system || null }).where(eq(users.userId, body.userId));
    return Response.json({ success: true });
  } catch (error) {
    return jsonError(error);
  }
}
