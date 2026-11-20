import { db } from '../../../../lib/db';
import { parseEmailVerificationToken, checkEmailVerificationToken } from '../../../../lib/email-verification';
import { z } from 'zod';

const schema = z.object({ token: z.string().min(20).max(2048) });
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Invalid verification link.' }, { status: 400 });
  const data = parseEmailVerificationToken(parsed.data.token);
  if (!data) return Response.json({ error: 'This verification link has expired or is invalid.' }, { status: 400 });
  const user = await db.user.findUnique({ where: { id: data.id }, select: { id: true, email: true, passwordHash: true, emailVerifiedAt: true } });
  if (!user || user.email !== data.email || !checkEmailVerificationToken(parsed.data.token, user.passwordHash)) return Response.json({ error: 'Invalid verification link.' }, { status: 400 });
  if (user.emailVerifiedAt) return Response.json({ message: 'Your email is already verified. You can sign in.' });
  await db.user.updateMany({ where: { id: user.id, emailVerifiedAt: null }, data: { emailVerifiedAt: new Date() } });
  return Response.json({ message: 'Email verified. You can now sign in.' });
}
