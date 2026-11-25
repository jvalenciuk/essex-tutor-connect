
import { db } from '../../../../../lib/db';
import { identity } from '../../../../../lib/security';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  context: {
    params: Promise<{ id: string }>;
  }
) {
  const { id } = await context.params;

  const requestedDate = new URL(request.url).searchParams.get('date');
  const date = requestedDate ? new Date(requestedDate + 'T00:00:00Z') : null;
  if (requestedDate !== null && (!date || !/^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ||
      !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== requestedDate)) {
    return Response.json({ error: 'Invalid date' }, { status: 400 });
  }
  if (date) {
    const who = await identity();
    const connection = who?.role === 'PARENT' && await db.inquiry.findFirst({
      where: { parentId: who.id, tutorId: id, status: 'ACCEPTED' },
      select: { id: true },
    });
    if (!connection) return Response.json({ error: 'Accepted inquiry required' }, { status: 403 });
  }
  const dayMs = 86_400_000;

  const tutor = await db.tutorProfile.findFirst({
    where: {
      id,
      ...(date ? {} : { verification: 'APPROVED' }),
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
        gte: date ? new Date(date.getTime() - dayMs) : now,
        lt: date ? new Date(date.getTime() + 2 * dayMs) : horizon,
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
    busy: bookings.filter(booking => !date || new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(booking.startsAt) === requestedDate).map(booking => ({
      startsAt:
        booking.startsAt.toISOString(),
      durationMinutes:
        booking.durationMinutes,
    })),
    timeZone: 'America/Toronto',
  });
}
