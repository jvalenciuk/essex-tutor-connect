
import { db } from '../../../lib/db';
import { identity, fail } from '../../../lib/security';
import { checkTutorSlot } from '../../../lib/booking-conflicts';
import { z } from 'zod';
import { expireUnpaidBookings } from '../../../lib/payment-expiration';

export const dynamic = 'force-dynamic';

const bookingSchema = z.object({
  inquiryId: z.string().min(1),
  startsAt: z.string().datetime({
    offset: true,
  }),
  durationMinutes: z.number().int().min(30).max(180),
});

export async function POST(req: Request) {
  const who = await identity();

  if (!who || (who.role !== 'TUTOR' && who.role !== 'PARENT')) {
    return fail('Parent or tutor account required', 403);
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
        ...(who.role === 'TUTOR' ? { userId: who.id } : {}),
        verification: 'APPROVED',
      },
      ...(who.role === 'PARENT' ? { parentId: who.id } : {}),
    },
    include: {
      tutor: true,
    },
  });

  if (!inquiry) {
    return fail('Accepted inquiry not found', 403);
  }

  await expireUnpaidBookings(inquiry.tutorId);

  const amountCents = Math.round(
    (inquiry.tutor.hourlyRateCents * data.durationMinutes) / 60
  );
  const platformFeeCents = Math.round(amountCents * 0.15);

  // Serialize creation with acceptance and rescheduling for this tutor.
  // This also makes the duplicate check atomic across concurrent requests.
  let booking;
  try {
    booking = await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT 1 AS lock_acquired FROM pg_advisory_xact_lock(hashtext(${inquiry.tutorId}))`;

      // Revalidate authorization and approval after acquiring the tutor lock.
      // An inquiry may have been closed or a tutor unapproved since the
      // initial lookup, while the request was waiting to enter the transaction.
      const activeInquiry = await tx.inquiry.findFirst({
        where: {
          id: inquiry.id,
          status: 'ACCEPTED',
          tutorId: inquiry.tutorId,
          tutor: {
            ...(who.role === 'TUTOR' ? { userId: who.id } : {}),
            verification: 'APPROVED',
          },
          ...(who.role === 'PARENT' ? { parentId: who.id } : {}),
        },
        select: { id: true },
      });
      if (!activeInquiry) throw new Error('INQUIRY_NO_LONGER_ACCEPTED');

      const issue = await checkTutorSlot(
        inquiry.tutorId,
        startsAt,
        data.durationMinutes,
        undefined,
        tx
      );
      if (issue) throw new Error(`SLOT_CONFLICT:${issue}`);

      const duplicate = await tx.booking.findFirst({
        where: {
          inquiryId: inquiry.id,
          status: {
            in: ['PROPOSED', 'CHANGE_REQUESTED', 'PENDING_PAYMENT', 'PAID'],
          },
          OR: [
            { startsAt },
            { status: 'CHANGE_REQUESTED', requestedStartsAt: startsAt },
          ],
        },
        select: { id: true },
      });
      if (duplicate) throw new Error('DUPLICATE_BOOKING');

      return tx.booking.create({
        data: {
          inquiryId: inquiry.id,
          parentId: inquiry.parentId,
          tutorId: inquiry.tutorId,
          startsAt,
          durationMinutes: data.durationMinutes,
          amountCents,
          platformFeeCents,
          status: who.role === 'PARENT' ? 'CHANGE_REQUESTED' : 'PROPOSED',
          ...(who.role === 'PARENT' ? {
            requestedStartsAt: startsAt,
            requestedDurationMinutes: data.durationMinutes,
          } : {}),
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
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('SLOT_CONFLICT:')) {
      return fail(error.message.slice('SLOT_CONFLICT:'.length), 409);
    }
    if (error instanceof Error && error.message === 'DUPLICATE_BOOKING') {
      return fail('A booking already exists for this date and time', 409);
    }
    if (error instanceof Error && error.message === 'INQUIRY_NO_LONGER_ACCEPTED') {
      return fail('This inquiry is no longer accepted or the tutor is no longer approved. Refresh and try again.', 409);
    }
    console.error('Booking creation transaction failed', error);
    return fail('Unable to create the booking. Please try again.', 503);
  }

  return Response.json(booking, {
    status: 201,
  });
}

export async function GET() {
  const who = await identity();

  if (!who) {
    return fail('Sign in required', 401);
  }

  const responseHeaders = {
    'X-Account-Role': who.role,
    'Cache-Control': 'private, no-store',
  };

  if (
    who.role !== 'PARENT' &&
    who.role !== 'TUTOR'
  ) {
    return Response.json([], {
      headers: responseHeaders,
    });
  }

  await expireUnpaidBookings();

  const where = who.role === 'TUTOR'
    ? { tutor: { userId: who.id } }
    : { parentId: who.id };

  const include = {
    parent: { select: { name: true } },
    tutor: { include: { user: { select: { name: true } } } },
    inquiry: { select: { subject: true, grade: true } },
  };

  // Keep upcoming sessions visible even after a user has accumulated
  // more than 100 historical bookings.
  const now = new Date();
  const [upcoming, recentHistory] = await Promise.all([
    db.booking.findMany({
      where: { ...where, startsAt: { gte: now } },
      include,
      orderBy: { startsAt: 'asc' },
      take: 100,
    }),
    db.booking.findMany({
      where: { ...where, startsAt: { lt: now } },
      include,
      orderBy: { startsAt: 'desc' },
      take: 50,
    }),
  ]);
  const bookings = [...upcoming, ...recentHistory].sort(
    (a, b) => a.startsAt.getTime() - b.startsAt.getTime()
  );

  return Response.json(bookings, {
    headers: responseHeaders,
  });
}
