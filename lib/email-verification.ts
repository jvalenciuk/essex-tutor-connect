import { createHmac, timingSafeEqual } from 'node:crypto';

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
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  const testTo = process.env.EMAIL_TEST_TO;
  const base = process.env.VERCEL_ENV === 'preview' ? 'https://we-learn-stripe-preview.vercel.app' : (process.env.APP_URL || process.env.NEXTAUTH_URL);
  if (!key || !from || !testTo || !base) throw new Error('Verification email testing is not configured');
  const url = new URL('/verify-email', base);
  url.searchParams.set('token', makeEmailVerificationToken(user.id, user.email, user.passwordHash));
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [testTo], subject: 'WE Learn: verify your email (Preview test)', text: 'Intended recipient: ' + user.email + '\nPreview testing only. Verify your email within 24 hours:\n' + url.toString() }),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('Verification email delivery failed: ' + response.status);
}
