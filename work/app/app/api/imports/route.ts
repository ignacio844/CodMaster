import { head } from '@vercel/blob';
import { getDb } from '../../../db';
import { imports } from '../../../db/schema';
import { readPrivateJson } from '../../../lib/blob-store';
import { canUpload, jsonError, requireAppUser } from '../../../lib/store';

const allowedSources = ['Octosis', 'Sistema de Facturación', 'MELI / Kobo', 'Torettos', 'Warnes'];

type ImportBody = {
  id: string;
  source: string;
  filename: string;
  objectKey: string;
  resultKey: string;
};

export async function POST(request: Request) {
  try {
    const user = await requireAppUser();
    const body = await request.json() as Partial<ImportBody>;
    if (!body.id || !body.source || !body.filename || !body.objectKey || !body.resultKey) {
      return Response.json({ error: 'INVALID_DATA' }, { status: 400 });
    }
    if (!allowedSources.includes(body.source) || !canUpload(user, body.source)) throw new Error('FORBIDDEN');
    if (!/^[0-9a-f-]{36}$/i.test(body.id) || !body.objectKey.startsWith(`imports/${body.id}/`) || body.resultKey !== `results/${body.id}.json`) {
      return Response.json({ error: 'INVALID_UPLOAD_PATH' }, { status: 400 });
    }
    if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error('BLOB_NOT_CONFIGURED');

    const [sourceBlob, resultBlob] = await Promise.all([head(body.objectKey), head(body.resultKey)]);
    if (sourceBlob.size > 30 * 1024 * 1024 || resultBlob.size > 40 * 1024 * 1024) {
      return Response.json({ error: 'FILE_TOO_LARGE' }, { status: 413 });
    }
    const results = await readPrivateJson<Array<{ status?: string }>>(body.resultKey);
    if (!Array.isArray(results)) return Response.json({ error: 'INVALID_RESULTS' }, { status: 400 });

    const rowCount = results.length;
    const matchedCount = results.filter((row) => row.status === 'Coincidencia').length;
    const reviewCount = results.filter((row) => row.status === 'Revisar').length;
    const orphanCount = results.filter((row) => row.status === 'Huérfano').length;
    await getDb().insert(imports).values({
      id: body.id,
      source: body.source,
      filename: body.filename.slice(0, 255),
      uploaderId: user.userId,
      rowCount,
      matchedCount,
      reviewCount,
      orphanCount,
      objectKey: body.objectKey,
      resultKey: body.resultKey,
    });
    return Response.json({ id: body.id, rowCount, matched: matchedCount, review: reviewCount, orphan: orphanCount });
  } catch (error) {
    return jsonError(error);
  }
}
