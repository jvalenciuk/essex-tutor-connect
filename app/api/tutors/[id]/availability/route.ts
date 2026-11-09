
import { db } from '../../../../../lib/db';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: {
    params: Promise<{ id: string }>;
  }
) {
  const { id } = await context.params;

  const tutor = await db.tutorProfile.findFirst({
    where: {
      id,
      verification: 'APPROVED',
    },
    select: {
      id: true,
      availability: {
        select: {
          dayOfWeek: true,
          startMinute: true,
          endMinute: true,
        },
        orderBy: [
          { dayOfWeek: 'asc' },
          { startMinute: 'asc' },
        ],
      },
      blockedDates: {
        select: {
          dateKey: true,
        },
      },
    },
  });

  if (!tutor) {
    return Response.json(
      { error: 'Tutor not found' },
      { status: 404 }
    );
  }

  const now = new Date();
  const horizon = new Date(
    now.getTime() +
      15 * 24 * 60 * 60 * 1000
  );

  const bookings = await db.booking.findMany({
    where: {
      tutorId: id,
      status: {
        in: [
          'PAID',
          'PENDING_PAYMENT',
        ],
      },
      startsAt: {
        gte: now,
        lt: horizon,
      },
    },
    select: {
      startsAt: true,
      durationMinutes: true,
    },
  });

  return Response.json({
    weekly: tutor.availability,
    blockedDates: tutor.blockedDates.map(
      date => date.dateKey
    ),
    busy: bookings.map(booking => ({
      startsAt:
        booking.startsAt.toISOString(),
      durationMinutes:
        booking.durationMinutes,
    })),
    timeZone: 'America/Toronto',
  });
}
