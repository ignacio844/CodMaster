import { eq } from 'drizzle-orm';
import { getDb } from '../../../db';
import { settings } from '../../../db/schema';
import { ensureBamMaster } from '../../../lib/bam-master';
import { getPrivateBlob } from '../../../lib/blob-store';
import { jsonError, requireAppUser } from '../../../lib/store';

export async function GET() {
  try {
    await requireAppUser();
    await ensureBamMaster();
    const [setting] = await getDb().select({ value: settings.value }).from(settings).where(eq(settings.key, 'master_key')).limit(1);
    if (!setting) return Response.json({ codes: [] });
    const result = await getPrivateBlob(setting.value);
    if (!result) return Response.json({ codes: [] });
    return new Response(result.stream, {
      headers: {
        'content-type': result.blob.contentType,
        'cache-control': 'private, no-cache',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
