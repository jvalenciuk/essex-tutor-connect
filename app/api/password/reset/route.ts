import { db } from '../../../../lib/db';
import { readResetToken, verifyResetToken } from '../../../../lib/password-reset';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

const schema = z.object({ token: z.string().min(20).max(2048), password: z.string().min(12).max(128) });
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Provide a valid link and a password of at least 12 characters.' }, { status: 400 });
  const { token, password } = parsed.data;
  const data = readResetToken(token);
  if (!data) return Response.json({ error: 'This reset link is invalid or expired.' }, { status: 400 });
  const user = await db.user.findUnique({ where: { id: data.id }, select: { id: true, passwordHash: true } });
  if (!user || !verifyResetToken(token, user.passwordHash)) return Response.json({ error: 'This reset link is invalid or has already been used.' }, { status: 400 });
  const passwordHash = await bcrypt.hash(password, 12);
  const result = await db.user.updateMany({ where: { id: user.id, passwordHash: user.passwordHash }, data: { passwordHash } });
  if (result.count !== 1) return Response.json({ error: 'This reset link is no longer valid.' }, { status: 409 });
  return Response.json({ message: 'Password updated. You can now sign in.' });
}
