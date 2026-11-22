
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
  durationMinutes: z.union([
    z.literal(30),
    z.literal(60),
    z.literal(90),
    z.literal(120),
    z.literal(180),
  ]),
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

  // Match the 15-minute start-time increments and 7 a.m.–10 p.m.
  // Eastern Time choices offered by the calendar booking form.
  const easternParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Toronto',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(startsAt);
  const localHour = Number(easternParts.find(part => part.type === 'hour')?.value);
  const localMinute = Number(easternParts.find(part => part.type === 'minute')?.value);
  if (
    !Number.isInteger(localHour) ||
    !Number.isInteger(localMinute) ||
    localHour < 7 ||
    localHour > 22 ||
    localMinute % 15 !== 0 ||
    startsAt.getUTCSeconds() !== 0 ||
    startsAt.getUTCMilliseconds() !== 0
  ) {
    return fail('Choose a start time between 7:00 a.m. and 10:45 p.m. Eastern, in 15-minute increments.', 400);
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
        select: {
          id: true,
          tutor: { select: { hourlyRateCents: true } },
        },
      });
      if (!activeInquiry) throw new Error('INQUIRY_NO_LONGER_ACCEPTED');
      if (startsAt.getTime() <= Date.now()) throw new Error('BOOKING_TIME_PASSED');

      // Price the session using the tutor's rate read in this transaction,
      // rather than a rate fetched before waiting for the booking lock.
      const amountCents = Math.round(
        (activeInquiry.tutor.hourlyRateCents * data.durationMinutes) / 60
      );
      const platformFeeCents = Math.round(amountCents * 0.15);

      const duplicate = await tx.booking.findFirst({
        where: {
          inquiryId: inquiry.id,
          status: {
            in: ['PROPOSED', 'CHANGE_REQUESTED', 'PENDING_PAYMENT', 'PAID'],
          },
          OR: [
            { status: { in: ['PROPOSED', 'PENDING_PAYMENT', 'PAID'] }, startsAt },
            { status: 'CHANGE_REQUESTED', requestedStartsAt: startsAt },
          ],
        },
        select: {
          id: true,
          inquiryId: true,
          startsAt: true,
          durationMinutes: true,
          requestedDurationMinutes: true,
          requestedStartsAt: true,
          amountCents: true,
          platformFeeCents: true,
          status: true,
        },
      });
      if (duplicate) {
        // A retried request for the same active session is safe to reuse.
        // Do not silently treat a different duration as the same booking.
        const matchingDuration = duplicate.status === 'CHANGE_REQUESTED'
          ? duplicate.requestedDurationMinutes
          : duplicate.durationMinutes;
        if (matchingDuration !== data.durationMinutes) {
          throw new Error('DUPLICATE_BOOKING');
        }
        // The existing booking is authoritative; never reprice or recreate it.
        return { ...duplicate, alreadyExists: true };
      }

      const issue = await checkTutorSlot(
        inquiry.tutorId,
        startsAt,
        data.durationMinutes,
        undefined,
        tx
      );
      if (issue) throw new Error(`SLOT_CONFLICT:${issue}`);

      const created = await tx.booking.create({
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
      return { ...created, alreadyExists: false };
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('SLOT_CONFLICT:')) {
      return fail(error.message.slice('SLOT_CONFLICT:'.length), 409);
    }
    if (error instanceof Error && error.message === 'DUPLICATE_BOOKING') {
      return fail('A session already exists at this time with a different duration. Open My Sessions to review it before requesting another.', 409);
    }
    if (error instanceof Error && error.message === 'INQUIRY_NO_LONGER_ACCEPTED') {
      return fail('This inquiry is no longer accepted or the tutor is no longer approved. Refresh and try again.', 409);
    }
    if (error instanceof Error && error.message === 'BOOKING_TIME_PASSED') {
      return fail('This session start time has passed. Choose a later time.', 409);
    }
    console.error('Booking creation transaction failed', error);
    return fail('Unable to create the booking. Please try again.', 503);
  }

  return Response.json(booking, {
    status: booking.alreadyExists ? 200 : 201,
    headers: { 'Cache-Control': 'private, no-store' },
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
