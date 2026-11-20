
import { db } from '../../../lib/db';
import { fail } from '../../../lib/security';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { createHash } from 'node:crypto';
import { sendVerificationEmail } from '../../../lib/email-verification';

const schema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(200),
  password: z.string().min(12).max(128),
  role: z.enum(['PARENT', 'TUTOR']),
});

export async function POST(req: Request) {
  try {
    const v = schema.parse(await req.json());
    const email = v.email.toLowerCase();
    // A shared database throttle protects across serverless instances.
    // Only accept a direct connecting address supplied by Vercel's proxy.
    const ip = req.headers.get('x-real-ip') || req.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const ipKey = createHash('sha256').update('register-ip:' + ip).digest('hex');
    const emailKey = createHash('sha256').update('register-email:' + email).digest('hex');
    for (const [key, limit] of [[ipKey, 10], [emailKey, 3]] as const) {
      const counts = await db.$queryRaw<Array<{ attempts: number }>>`
        INSERT INTO "PasswordResetThrottle" ("key", "windowStart", "attempts") VALUES (${key}, NOW(), 1)
        ON CONFLICT ("key") DO UPDATE SET
          "attempts" = CASE WHEN "PasswordResetThrottle"."windowStart" < NOW() - INTERVAL '1 hour' THEN 1 ELSE "PasswordResetThrottle"."attempts" + 1 END,
          "windowStart" = CASE WHEN "PasswordResetThrottle"."windowStart" < NOW() - INTERVAL '1 hour' THEN NOW() ELSE "PasswordResetThrottle"."windowStart" END
        RETURNING "attempts"
      `;
      if ((counts[0]?.attempts ?? limit + 1) > limit) return fail('Too many registration attempts. Please try again later.', 429);
    }

    const existing = await db.user.findUnique({
      where: { email },
    });

    if (existing) {
      return fail('Email already registered', 409);
    }

    if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM || !process.env.EMAIL_TEST_TO || !process.env.NEXTAUTH_SECRET) {
      return fail('New account registration is temporarily unavailable while email verification is being configured.', 503);
    }

    const passwordHash = await bcrypt.hash(v.password, 12);

    const user = await db.user.create({
      data: {
        name: v.name,
        email,
        passwordHash,
        role: v.role,

        ...(v.role === 'TUTOR'
          ? {
              tutor: {
                create: {
                  bio: '',
                  subjects: [],
                  grades: [],
                  cities: [],
                  languages: [],
                  hourlyRateCents: 0,
                  online: false,
                  verification: 'PENDING',
                  qualifications: '',
                },
              },
            }
          : {}),
      },
    });

    try { await sendVerificationEmail({ id: user.id, email: user.email, passwordHash }); }
    catch (error) {
      console.error('Verification email could not be delivered', error);
      return Response.json({ error: 'Account created, but the verification email could not be sent. Please use Resend verification email on the login page.', accountCreated: true }, { status: 503 });
    }

    return Response.json(
      { id: user.id, verificationRequired: true },
      { status: 201 }
    );
  } catch (e) {
    if (e instanceof z.ZodError) {
      return fail('Invalid registration details', 400);
    }

    console.error('Registration failed:', e);
    return fail('Registration failed', 500);
  }
}
