import { cookies } from 'next/headers';
import { normalizedAllowedEmails } from '../config/allowed-emails';

export type GoogleUser = { userId: string; email: string; displayName: string; picture: string | null };
type SessionPayload = GoogleUser & { expiresAt: number };

const COOKIE_NAME = 'bam_google_session';
const SESSION_SECONDS = 7 * 24 * 60 * 60;

function encode(value: string) {
  return btoa(unescape(encodeURIComponent(value))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

function decode(value: string) {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4);
  return decodeURIComponent(escape(atob(padded)));
}

async function signature(value: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error('AUTH_NOT_CONFIGURED');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

export async function createGoogleSession(user: GoogleUser) {
  const payload = encode(JSON.stringify({ ...user, expiresAt: Date.now() + SESSION_SECONDS * 1000 } satisfies SessionPayload));
  return `${payload}.${await signature(payload)}`;
}

export async function readGoogleSession(token: string | undefined): Promise<GoogleUser | null> {
  if (!token) return null;
  const [payload, suppliedSignature] = token.split('.');
  if (!payload || !suppliedSignature || suppliedSignature !== await signature(payload)) return null;
  const parsed = JSON.parse(decode(payload)) as SessionPayload;
  if (parsed.expiresAt < Date.now() || !normalizedAllowedEmails.includes(parsed.email.toLowerCase())) return null;
  return { userId: parsed.userId, email: parsed.email, displayName: parsed.displayName, picture: parsed.picture };
}

export async function getGoogleUser() {
  const store = await cookies();
  return readGoogleSession(store.get(COOKIE_NAME)?.value);
}

export function googleSessionCookie(token: string) {
  return `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_SECONDS}`;
}

export function clearGoogleSessionCookie() {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

export function isAllowedEmail(email: string) {
  return normalizedAllowedEmails.includes(email.trim().toLowerCase());
}
