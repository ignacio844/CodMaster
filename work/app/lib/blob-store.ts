import { get } from '@vercel/blob';

export async function getPrivateBlob(pathname: string) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error('BLOB_NOT_CONFIGURED');
  const result = await get(pathname, { access: 'private' });
  return result?.statusCode === 200 ? result : null;
}

export async function readPrivateJson<T>(pathname: string): Promise<T | null> {
  const result = await getPrivateBlob(pathname);
  if (!result) return null;
  return JSON.parse(await new Response(result.stream).text()) as T;
}
