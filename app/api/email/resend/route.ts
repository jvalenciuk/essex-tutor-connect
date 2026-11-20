import { db } from '../../../../lib/db';
import { sendVerificationEmail } from '../../../../lib/email-verification';
import { createHash } from 'node:crypto';
import { z } from 'zod';

const schema = z.object({ email: z.string().trim().email().max(200) });
const generic = { message: 'If the account requires verification, a new link will be sent to the test inbox.' };
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Enter a valid email address.' }, { status: 400 });
  const email = parsed.data.email.toLowerCase();
  const key = createHash('sha256').update('verify:' + email).digest('hex');
  const attempts = await db.$queryRaw<Array<{ attempts: number }>>`
    INSERT INTO "PasswordResetThrottle" ("key", "windowStart", "attempts") VALUES (${key}, NOW(), 1)
    ON CONFLICT ("key") DO UPDATE SET
      "attempts" = CASE WHEN "PasswordResetThrottle"."windowStart" < NOW() - INTERVAL '1 hour' THEN 1 ELSE "PasswordResetThrottle"."attempts" + 1 END,
      "windowStart" = CASE WHEN "PasswordResetThrottle"."windowStart" < NOW() - INTERVAL '1 hour' THEN NOW() ELSE "PasswordResetThrottle"."windowStart" END
    RETURNING "attempts"
  `;
  if ((attempts[0]?.attempts ?? 4) > 3) return Response.json(generic);
  const user = await db.user.findUnique({ where: { email }, select: { id: true, email: true, passwordHash: true, emailVerifiedAt: true } });
  if (user && !user.emailVerifiedAt) {
    try { await sendVerificationEmail(user); }
    catch (error) { console.error('Resend verification failed', error); return Response.json(generic); }
  }
  return Response.json(generic);
}
