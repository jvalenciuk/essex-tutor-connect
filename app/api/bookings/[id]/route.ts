
import { db } from '../../../../lib/db';
import { identity, fail } from '../../../../lib/security';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const actionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('ACCEPT'),
  }),
  z.object({
    action: z.literal('DECLINE'),
  }),
  z.object({
    action: z.literal('REQUEST_CHANGE'),
    startsAt: z.string().datetime({ offset: true }),
    durationMinutes: z.number().int().min(30).max(180),
    note: z.string().trim().max(1000).optional(),
  }),
  z.object({
    action: z.literal('REVISE'),
    startsAt: z.string().datetime({ offset: true }),
    durationMinutes: z.number().int().min(30).max(180),
  }),
]);

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const who = await identity();

  if (!who) {
    return fail('Sign in required', 401);
  }

  const { id } = await context.params;

  let data: z.infer<typeof actionSchema>;

  try {
    data = actionSchema.parse(await req.json());
  } catch {
    return fail('Invalid booking action', 400);
  }

  const booking = await db.booking.findUnique({
    where: { id },
    include: {
      tutor: true,
    },
  });

  if (!booking) {
    return fail('Booking not found', 404);
  }

  const isParent = booking.parentId === who.id;

  const isTutor =
    booking.tutor.userId === who.id &&
    who.role === 'TUTOR';

  if (!isParent && !isTutor) {
    return fail('Not authorized', 403);
  }

  if (data.action === 'ACCEPT') {
    if (!isParent || booking.status !== 'PROPOSED') {
      return fail('Cannot accept this booking', 409);
    }

    const result = await db.booking.updateMany({
      where: {
        id,
        status: 'PROPOSED',
        parentId: who.id,
        startsAt: { gt: new Date() },
      },
      data: {
        status: 'PENDING_PAYMENT',
      },
    });

    if (!result.count) {
      return fail('Booking is no longer available', 409);
    }

    return Response.json({
      success: true,
      status: 'PENDING_PAYMENT',
    });
  }

  if (data.action === 'DECLINE') {
    if (!isParent || booking.status !== 'PROPOSED') {
      return fail('Cannot decline this booking', 409);
    }

    const result = await db.booking.updateMany({
      where: {
        id,
        status: 'PROPOSED',
        parentId: who.id,
      },
      data: {
        status: 'DECLINED',
      },
    });

    if (!result.count) {
      return fail('Booking has already changed', 409);
    }

    return Response.json({
      success: true,
      status: 'DECLINED',
    });
  }

  if (data.action === 'REQUEST_CHANGE') {
    if (!isParent || booking.status !== 'PROPOSED') {
      return fail('Cannot request a change', 409);
    }

    const requestedStartsAt = new Date(data.startsAt);

    if (requestedStartsAt.getTime() <= Date.now()) {
      return fail('Choose a future date and time', 400);
    }

    const result = await db.booking.updateMany({
      where: {
        id,
        status: 'PROPOSED',
        parentId: who.id,
      },
      data: {
        status: 'CHANGE_REQUESTED',
        requestedStartsAt,
        requestedDurationMinutes: data.durationMinutes,
        requestNote: data.note || null,
      },
    });

    if (!result.count) {
      return fail('Booking has already changed', 409);
    }

    return Response.json({
      success: true,
      status: 'CHANGE_REQUESTED',
    });
  }

  if (data.action === 'REVISE') {
    if (!isTutor || booking.status !== 'CHANGE_REQUESTED') {
      return fail('Cannot revise this booking', 409);
    }

    const startsAt = new Date(data.startsAt);

    if (startsAt.getTime() <= Date.now()) {
      return fail('Choose a future date and time', 400);
    }

    const amountCents = Math.round(
      (booking.tutor.hourlyRateCents *
        data.durationMinutes) /
        60
    );

    const platformFeeCents = Math.round(
      amountCents * 0.15
    );

    const result = await db.booking.updateMany({
      where: {
        id,
        status: 'CHANGE_REQUESTED',
        tutor: { userId: who.id },
      },
      data: {
        startsAt,
        durationMinutes: data.durationMinutes,
        amountCents,
        platformFeeCents,
        status: 'PROPOSED',
        requestedStartsAt: null,
        requestedDurationMinutes: null,
        requestNote: null,
      },
    });

    if (!result.count) {
      return fail('Booking has already changed', 409);
    }

    return Response.json({
      success: true,
      status: 'PROPOSED',
    });
  }

  return fail('Unsupported booking action', 400);
}
