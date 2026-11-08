
import { db } from './db';

const MINUTE_MS = 60 * 1000;
const MAX_SESSION_MINUTES = 180;

export async function hasBookingConflict(
  tutorId: string,
  startsAt: Date,
  durationMinutes: number,
  excludeBookingId?: string
): Promise<boolean> {
  const proposedStart = startsAt.getTime();
  const proposedEnd =
    proposedStart + durationMinutes * MINUTE_MS;

  const earliestPossibleStart = new Date(
    proposedStart - MAX_SESSION_MINUTES * MINUTE_MS
  );

  const latestPossibleStart = new Date(proposedEnd);

  const bookings = await db.booking.findMany({
    where: {
      tutorId,
      status: {
        in: ['PAID', 'PENDING_PAYMENT'],
      },
      startsAt: {
        gte: earliestPossibleStart,
        lt: latestPossibleStart,
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

  return bookings.some((booking) => {
    const existingStart = booking.startsAt.getTime();
    const existingEnd =
      existingStart +
      booking.durationMinutes * MINUTE_MS;

    return (
      proposedStart < existingEnd &&
      existingStart < proposedEnd
    );
  });
}
