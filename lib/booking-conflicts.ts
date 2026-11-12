
import { db } from './db';
import type { Prisma } from '@prisma/client';

type BookingReader = Pick<Prisma.TransactionClient, 'tutorAvailability' | 'tutorBlockedDate' | 'booking'>;

const MINUTE = 60_000;
const ZONE = 'America/Toronto';

function localParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const part = (name: string) =>
    parts.find(p => p.type === name)?.value || '';

  const weekday = [
    'Sun', 'Mon', 'Tue', 'Wed',
    'Thu', 'Fri', 'Sat',
  ].indexOf(part('weekday'));

  return {
    dateKey:
      `${part('year')}-${part('month')}-${part('day')}`,
    weekday,
    minute:
      Number(part('hour')) * 60 +
      Number(part('minute')),
  };
}

export async function checkTutorSlot(
  tutorId: string,
  startsAt: Date,
  durationMinutes: number,
  excludeBookingId?: string,
  reader: BookingReader = db
): Promise<string | null> {
  if (
    !Number.isInteger(durationMinutes) ||
    durationMinutes < 30 ||
    durationMinutes > 180 ||
    startsAt.getTime() <= Date.now()
  ) {
    return 'Choose a future session between 30 and 180 minutes.';
  }

  const end = new Date(
    startsAt.getTime() + durationMinutes * MINUTE
  );

  const beginning = localParts(startsAt);
  const lastMinute = localParts(
    new Date(end.getTime() - 1)
  );
  const ending = localParts(end);

  if (beginning.dateKey !== lastMinute.dateKey) {
    return 'Sessions must start and finish on the same local date.';
  }

  const [hours, blocks] = await Promise.all([
    reader.tutorAvailability.findMany({
      where: { tutorId },
    }),
    reader.tutorBlockedDate.findMany({
      where: {
        tutorId,
        dateKey: beginning.dateKey,
      },
    }),
  ]);

  if (blocks.length) {
    return 'The tutor has blocked this date.';
  }

  // Tutors without saved hours retain the previous
  // booking behaviour until they set a schedule.
  if (hours.length) {
    const covered = hours.some(
      h =>
        h.dayOfWeek === beginning.weekday &&
        beginning.minute >= h.startMinute &&
        ending.minute <= h.endMinute &&
        ending.dateKey === beginning.dateKey
    );

    if (!covered) {
      return 'This session is outside the tutor’s weekly availability.';
    }
  }

  const candidates = await reader.booking.findMany({
    where: {
      tutorId,
      status: {
        in: ['PAID', 'PENDING_PAYMENT'],
      },
      startsAt: {
        gte: new Date(
          startsAt.getTime() - 180 * MINUTE
        ),
        lt: end,
      },
      ...(excludeBookingId
        ? { id: { not: excludeBookingId } }
        : {}),
    },
    select: {
      startsAt: true,
      durationMinutes: true,
    },
  });

  const overlapping = candidates.some(
    b =>
      startsAt.getTime() <
        b.startsAt.getTime() +
          b.durationMinutes * MINUTE &&
      b.startsAt.getTime() < end.getTime()
  );

  if (overlapping) {
    return 'This time overlaps another confirmed or awaiting-payment session.';
  }

  return null;
}

export async function hasBookingConflict(
  tutorId: string,
  startsAt: Date,
  durationMinutes: number,
  excludeBookingId?: string
) {
  return (
    await checkTutorSlot(
      tutorId,
      startsAt,
      durationMinutes,
      excludeBookingId
    )
  ) !== null;
}
