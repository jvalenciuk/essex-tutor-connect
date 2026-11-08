
import { db } from '../../../../lib/db';
import { notifyBooking } from '../../../../lib/email';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const HOUR_MS = 60 * 60 * 1000;

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authorization = req.headers.get('authorization');

  if (
    !cronSecret ||
    authorization !== `Bearer ${cronSecret}`
  ) {
    return Response.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const now = Date.now();

  // A daily job checks sessions starting 24–48 hours
  // from the current run.
  const windowStart = new Date(now + 24 * HOUR_MS);
  const windowEnd = new Date(now + 48 * HOUR_MS);

  try {
    const bookings = await db.booking.findMany({
      where: {
        status: 'PAID',
        startsAt: {
          gte: windowStart,
          lt: windowEnd,
        },
      },
      select: {
        id: true,
      },
      take: 100,
    });

    let sent = 0;
    let failed = 0;

    for (const booking of bookings) {
      try {
        await notifyBooking(booking.id, 'REMINDER');
        sent++;
      } catch (error) {
        failed++;

        console.error('Reminder failed', {
          bookingId: booking.id,
          error,
        });
      }
    }

    return Response.json({
      success: failed === 0,
      bookingsFound: bookings.length,
      bookingsNotified: sent,
      failures: failed,
    });
  } catch (error) {
    console.error('Reminder cron failed', error);

    return Response.json(
      { error: 'Unable to process reminders' },
      { status: 500 }
    );
  }
}
