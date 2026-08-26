import { clearGoogleSessionCookie } from '../../../../lib/google-auth';

export async function POST() {
  return Response.json({ success: true }, { headers: { 'set-cookie': clearGoogleSessionCookie() } });
}
