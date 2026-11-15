
import { db } from '../../../../lib/db';
import { identity, fail } from '../../../../lib/security';
import { z } from 'zod';

const schema = z.object({
  tutorId: z.string().min(1),
  verification: z.enum([
    'APPROVED',
    'REJECTED',
    'PENDING',
  ]),
});

export async function POST(req: Request) {
  try {
    // 1. Check the user's authenticated session.
    const who = await identity();

    if (!who) {
      return fail('Unauthorized', 401);
    }

    // 2. Check the CURRENT role in the database.
    const admin = await db.user.findUnique({
      where: { id: who.id },
      select: {
        id: true,
        role: true,
      },
    });

    if (!admin || admin.role !== 'ADMIN') {
      return fail('Forbidden', 403);
    }

    // 3. Validate the request.
    const parsed = schema.safeParse(await req.json());

    if (!parsed.success) {
      return fail('Invalid verification request', 400);
    }

    const { tutorId, verification } = parsed.data;

    // 4. Update verification and audit together.
    const result = await db.$transaction(async (tx) => {
      // Serialize concurrent verification changes for this tutor.
      const locked = await tx.$queryRaw<
        Array<{ id: string }>
      >`
        SELECT id
        FROM "TutorProfile"
        WHERE id = ${tutorId}
        FOR UPDATE
      `;

      if (locked.length === 0) {
        return null;
      }

      const tutor = await tx.tutorProfile.findUniqueOrThrow({
        where: { id: tutorId },
        select: {
          id: true,
          verification: true,
        },
      });

      // No audit entry needed if nothing changes.
      if (tutor.verification === verification) {
        return {
          id: tutor.id,
          verification: tutor.verification,
        };
      }

      const updated = await tx.tutorProfile.update({
        where: { id: tutorId },
        data: { verification },
        select: {
          id: true,
          verification: true,
        },
      });

      await tx.tutorVerificationAudit.create({
        data: {
          tutorId,
          adminId: admin.id,
          previousVerification: tutor.verification,
          newVerification: verification,
        },
      });

      return updated;
    });

    if (!result) {
      return fail('Tutor not found', 404);
    }

    return Response.json({
      id: result.id,
      verification: result.verification,
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return fail('Invalid JSON request', 400);
    }

    console.error('Tutor verification failed:', error);

    return fail('Verification update failed', 500);
  }
}
