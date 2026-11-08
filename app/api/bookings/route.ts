
import { db } from '../../../lib/db';
import { identity, fail } from '../../../lib/security';
import { hasBookingConflict } from '../../../lib/booking-conflicts';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const bookingSchema = z.object({
  inquiryId: z.string().min(1),
  startsAt: z.string().datetime({ offset: true }),
  durationMinutes: z.number().int().min(30).max(180),
});

export async function POST(req: Request) {
  const who = await identity();

  if (!who || who.role !== 'TUTOR') {
    return fail('Tutor account required', 403);
  }

  let data: z.infer<typeof bookingSchema>;

  try {
    data = bookingSchema.parse(await req.json());
  } catch {
    return fail('Invalid booking details', 400);
  }

  const startsAt = new Date(data.startsAt);

  if (startsAt.getTime() <= Date.now()) {
    return fail('Choose a future date and time', 400);
  }

  const inquiry = await db.inquiry.findFirst({
    where: {
      id: data.inquiryId,
      status: 'ACCEPTED',
      tutor: {
        userId: who.id,
        verification: 'APPROVED',
      },
    },
    include: {
      tutor: true,
    },
  });

  if (!inquiry) {
    return fail('Accepted inquiry not found', 403);
  }

  const conflict = await hasBookingConflict(
    inquiry.tutorId,
    startsAt,
    data.durationMinutes
  );

  if (conflict) {
    return fail(
      'This time overlaps another confirmed or awaiting-payment session. Choose a different time.',
      409
    );
  }

  const duplicate = await db.booking.findFirst({
    where: {
      inquiryId: inquiry.id,
      startsAt,
      status: {
        in: [
          'PROPOSED',
          'CHANGE_REQUESTED',
          'PENDING_PAYMENT',
          'PAID',
        ],
      },
    },
  });

  if (duplicate) {
    return fail(
      'A booking already exists for this date and time',
      409
    );
  }

  const amountCents = Math.round(
    (inquiry.tutor.hourlyRateCents *
      data.durationMinutes) /
      60
  );

  const platformFeeCents = Math.round(
    amountCents * 0.15
  );

  const booking = await db.booking.create({
    data: {
      inquiryId: inquiry.id,
      parentId: inquiry.parentId,
      tutorId: inquiry.tutorId,
      startsAt,
      durationMinutes: data.durationMinutes,
      amountCents,
      platformFeeCents,
      status: 'PROPOSED',
    },
    select: {
      id: true,
      inquiryId: true,
      startsAt: true,
      durationMinutes: true,
      amountCents: true,
      platformFeeCents: true,
      status: true,
    },
  });

  return Response.json(booking, { status: 201 });
}

export async function GET() {
  const who = await identity();

  if (!who) {
    return fail('Sign in required', 401);
  }

  if (
    who.role !== 'PARENT' &&
    who.role !== 'TUTOR'
  ) {
    return Response.json([]);
  }

  const bookings = await db.booking.findMany({
    where:
      who.role === 'TUTOR'
        ? { tutor: { userId: who.id } }
        : { parentId: who.id },
    include: {
      parent: {
        select: { name: true },
      },
      tutor: {
        include: {
          user: {
            select: { name: true },
          },
        },
      },
      inquiry: {
        select: {
          subject: true,
          grade: true,
        },
      },
    },
    orderBy: {
      startsAt: 'asc',
    },
    take: 100,
  });

  return Response.json(bookings);
}
