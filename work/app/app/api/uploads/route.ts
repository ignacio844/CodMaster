import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { canUpload, jsonError, requireAppUser } from '../../../lib/store';

const sourceContentTypes = [
  'application/octet-stream',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'text/plain',
];
const allowedSources = ['Octosis', 'Sistema de Facturación', 'MELI / Kobo', 'Torettos', 'Warnes'];

type UploadPayload = {
  importId: string;
  kind: 'source' | 'results';
  source: string;
};

export async function POST(request: Request) {
  try {
    const body = await request.json() as HandleUploadBody;
    const response = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const user = await requireAppUser();
        const payload = JSON.parse(clientPayload ?? '{}') as Partial<UploadPayload>;
        if (!payload.importId || !/^[0-9a-f-]{36}$/i.test(payload.importId) || !payload.kind || !payload.source || !allowedSources.includes(payload.source)) {
          throw new Error('INVALID_UPLOAD');
        }
        if (!canUpload(user, payload.source)) throw new Error('FORBIDDEN');

        const expectedPrefix = payload.kind === 'source' ? `imports/${payload.importId}/` : `results/${payload.importId}.json`;
        const validPath = payload.kind === 'source' ? pathname.startsWith(expectedPrefix) : pathname === expectedPrefix;
        if (!validPath) throw new Error('INVALID_UPLOAD_PATH');

        return {
          addRandomSuffix: false,
          allowedContentTypes: payload.kind === 'source' ? sourceContentTypes : ['application/json'],
          maximumSizeInBytes: payload.kind === 'source' ? 30 * 1024 * 1024 : 40 * 1024 * 1024,
          tokenPayload: JSON.stringify({ ...payload, userId: user.userId }),
        };
      },
      onUploadCompleted: async () => undefined,
    });
    return Response.json(response);
  } catch (error) {
    return jsonError(error);
  }
}
