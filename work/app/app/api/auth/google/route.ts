import { createGoogleSession, googleSessionCookie, isAllowedEmail } from '../../../../lib/google-auth';

type GoogleTokenInfo = { aud?: string; sub?: string; email?: string; email_verified?: string; name?: string; picture?: string; exp?: string };

export async function POST(request: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return Response.json({ error: 'GOOGLE_NOT_CONFIGURED' }, { status: 503 });
  const { credential } = await request.json() as { credential?: string };
  if (!credential) return Response.json({ error: 'MISSING_CREDENTIAL' }, { status: 400 });

  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
  if (!response.ok) return Response.json({ error: 'INVALID_GOOGLE_TOKEN' }, { status: 401 });
  const token = await response.json() as GoogleTokenInfo;
  const email = token.email?.trim().toLowerCase();
  if (token.aud !== clientId || token.email_verified !== 'true' || !token.sub || !email || Number(token.exp ?? 0) * 1000 < Date.now()) {
    return Response.json({ error: 'INVALID_GOOGLE_TOKEN' }, { status: 401 });
  }
  if (!isAllowedEmail(email)) return Response.json({ error: 'EMAIL_NOT_ALLOWED' }, { status: 403 });

  const session = await createGoogleSession({ userId: email, email, displayName: token.name || email, picture: token.picture || null });
  return Response.json({ success: true }, { headers: { 'set-cookie': googleSessionCookie(session) } });
}
