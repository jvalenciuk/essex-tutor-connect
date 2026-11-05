
import { db } from '../../../lib/db';
import { fail } from '../../../lib/security';
import { z } from 'zod';
import bcrypt from 'bcryptjs';

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

    const existing = await db.user.findUnique({
      where: { email },
    });

    if (existing) {
      return fail('Email already registered', 409);
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

    return Response.json(
      { id: user.id },
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
