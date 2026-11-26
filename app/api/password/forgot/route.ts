import { accountEmailConfig, sendAccountEmail } from '../../../../lib/account-email';
import { db } from '../../../../lib/db';
import { makeResetToken } from '../../../../lib/password-reset';
import { z } from 'zod';
import { createHash } from 'node:crypto';

const schema = z.object({ email: z.string().trim().email().max(200) });
const generic = { message: 'If an account exists, password reset instructions will be sent.' };

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Enter a valid email address.' }, { status: 400 });
  const config = accountEmailConfig();
  if (!config) return Response.json({ error: 'Password reset is temporarily unavailable while account email is being configured.' }, { status: 503 });

  const email = parsed.data.email.toLowerCase();
  // Atomic database-backed limit: at most 3 reset requests per email each hour.
  // The same generic response is used for unknown accounts and throttled requests.
  const throttleKey = createHash('sha256').update(email).digest('hex');
  const attempts = await db.$queryRaw<Array<{ attempts: number }>>`
    INSERT INTO "PasswordResetThrottle" ("key", "windowStart", "attempts")
    VALUES (${throttleKey}, NOW(), 1)
    ON CONFLICT ("key") DO UPDATE SET
      "attempts" = CASE
        WHEN "PasswordResetThrottle"."windowStart" < NOW() - INTERVAL '1 hour' THEN 1
        ELSE "PasswordResetThrottle"."attempts" + 1 END,
      "windowStart" = CASE
        WHEN "PasswordResetThrottle"."windowStart" < NOW() - INTERVAL '1 hour' THEN NOW()
        ELSE "PasswordResetThrottle"."windowStart" END
    RETURNING "attempts"
  `;
  if ((attempts[0]?.attempts ?? 4) > 3) return Response.json(generic);
  const user = await db.user.findUnique({ where: { email }, select: { id: true, passwordHash: true } });
  if (!user) return Response.json(generic);

  try {
    const link = new URL('/reset-password', config.origin);
    link.searchParams.set('token', makeResetToken(user.id, user.passwordHash));
    await sendAccountEmail(config, email, 'WE Learn password reset',
      'This link expires in 30 minutes and becomes invalid after a password change.\n\n' + link.toString());
  } catch (error) {
    console.error('Password reset email delivery failed', error);
  }
  return Response.json(generic);
}
