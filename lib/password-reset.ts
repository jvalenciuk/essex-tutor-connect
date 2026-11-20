import { createHmac, timingSafeEqual } from 'node:crypto';

const WINDOW_MS = 30 * 60 * 1000;

function signature(payload: string, passwordHash: string) {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error('Authentication secret is missing');
  return createHmac('sha256', secret).update(payload).update(':').update(passwordHash).digest('hex');
}

export function makeResetToken(userId: string, passwordHash: string) {
  const payload = Buffer.from(JSON.stringify({ id: userId, expires: Date.now() + WINDOW_MS })).toString('base64url');
  return payload + '.' + signature(payload, passwordHash);
}

export function readResetToken(token: string): { id: string; expires: number } | null {
  if (token.length > 2048 || !/^[A-Za-z0-9_-]+\.[a-f0-9]{64}$/.test(token)) return null;
  try {
    const [payload] = token.split('.');
    const parsed: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!parsed || typeof parsed !== 'object') return null;
    const value = parsed as { id?: unknown; expires?: unknown };
    if (typeof value.id !== 'string' || !value.id || typeof value.expires !== 'number' || value.expires <= Date.now() || value.expires > Date.now() + WINDOW_MS) return null;
    return { id: value.id, expires: value.expires };
  } catch { return null; }
}

export function verifyResetToken(token: string, passwordHash: string) {
  const [payload, provided] = token.split('.');
  if (!payload || !provided || !/^[a-f0-9]{64}$/.test(provided)) return false;
  const expected = signature(payload, passwordHash);
  return timingSafeEqual(Buffer.from(provided, 'hex'), Buffer.from(expected, 'hex'));
}
