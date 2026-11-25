import { createHmac, timingSafeEqual } from 'node:crypto';
import { accountEmailConfig, sendAccountEmail } from './account-email';

const DURATION = 24 * 60 * 60 * 1000;
function sign(payload: string, passwordHash: string) {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error('Authentication secret not configured');
  return createHmac('sha256', secret).update('verify-email:').update(payload).update(':').update(passwordHash).digest('hex');
}
export function makeEmailVerificationToken(id: string, email: string, passwordHash: string) {
  const payload = Buffer.from(JSON.stringify({ id, email, exp: Date.now() + DURATION })).toString('base64url');
  return payload + '.' + sign(payload, passwordHash);
}
export function parseEmailVerificationToken(token: string) {
  if (token.length > 2048 || !/^[A-Za-z0-9_-]+\.[a-f0-9]{64}$/.test(token)) return null;
  try {
    const [payload] = token.split('.');
    const data: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data || typeof data !== 'object') return null;
    const value = data as { id?: unknown; email?: unknown; exp?: unknown };
    if (typeof value.id !== 'string' || typeof value.email !== 'string' || typeof value.exp !== 'number' || value.exp <= Date.now() || value.exp > Date.now() + DURATION) return null;
    return { id: value.id, email: value.email };
  } catch { return null; }
}
export function checkEmailVerificationToken(token: string, passwordHash: string) {
  const [payload, provided] = token.split('.');
  if (!payload || !provided || !/^[a-f0-9]{64}$/.test(provided)) return false;
  return timingSafeEqual(Buffer.from(provided, 'hex'), Buffer.from(sign(payload, passwordHash), 'hex'));
}
export async function sendVerificationEmail(user: { id: string; email: string; passwordHash: string }) {
  const config = accountEmailConfig();
  if (!config) throw new Error('Verification email is not configured');
  const url = new URL('/verify-email', config.origin);
  url.searchParams.set('token', makeEmailVerificationToken(user.id, user.email, user.passwordHash));
  await sendAccountEmail(config, user.email, 'WE Learn: verify your email',
    'Verify your email within 24 hours:\n' + url.toString());
}
