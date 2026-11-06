
import { db } from '../../../../lib/db';
import { identity, fail } from '../../../../lib/security';
import { z } from 'zod';

const schema = z.object({
  status: z.enum(['ACCEPTED', 'DECLINED']),
});

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const who = await identity();

  if (!who || who.role !== 'TUTOR') {
    return fail('Tutor account required', 403);
  }

  const { id } = await context.params;

  try {
    const { status } = schema.parse(await req.json());

    const result = await db.inquiry.updateMany({
      where: {
        id,
        status: 'OPEN',
        tutor: {
          userId: who.id,
        },
      },
      data: {
        status,
      },
    });

    if (result.count === 0) {
      return fail(
        'Inquiry not found, already handled, or not authorized',
        409
      );
    }

    return Response.json({
      success: true,
      status,
    });
  } catch {
    return fail('Invalid inquiry update', 400);
  }
}
