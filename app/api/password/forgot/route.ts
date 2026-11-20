import { db } from '../../../../lib/db';
import { makeResetToken } from '../../../../lib/password-reset';
import { z } from 'zod';

const schema = z.object({ email: z.string().trim().email().max(200) });
const generic = { message: 'If an account exists, password reset instructions will be sent.' };

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Enter a valid email address.' }, { status: 400 });
  const email = parsed.data.email.toLowerCase();
  const user = await db.user.findUnique({ where: { email }, select: { id: true, passwordHash: true } });
  if (!user) return Response.json(generic);

  // Reset email remains restricted to the configured test inbox in Preview.
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  const testTo = process.env.EMAIL_TEST_TO;
  const base = process.env.APP_URL || process.env.NEXTAUTH_URL;
  if (!key || !from || !testTo || !base) return Response.json({ error: 'Password recovery is temporarily unavailable.' }, { status: 503 });
  const token = makeResetToken(user.id, user.passwordHash);
  const link = new URL('/reset-password', base);
  link.searchParams.set('token', token);
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [testTo], subject: 'WE Learn password reset (Preview test)', text: 'Intended recipient: ' + email + '\\nPreview testing only. This link expires in 30 minutes and becomes invalid after a password change.\\n\\n' + link.toString() }),
      cache: 'no-store',
    });
    if (!response.ok) { console.error('Password reset test email delivery failed', response.status); return Response.json({ error: 'Password recovery is temporarily unavailable.' }, { status: 503 }); }
  } catch { return Response.json({ error: 'Password recovery is temporarily unavailable.' }, { status: 503 }); }
  return Response.json(generic);
}
