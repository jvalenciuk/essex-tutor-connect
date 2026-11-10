
import { db } from '../../../../lib/db';
import { notifyBooking } from '../../../../lib/email';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const HOUR_MS = 60 * 60 * 1000;
const LOCK_TIMEOUT_MS = 10 * 60 * 1000;

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authorization =
    req.headers.get('authorization');

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

  const windowStart = new Date(
    now + 24 * HOUR_MS
  );

  const windowEnd = new Date(
    now + 48 * HOUR_MS
  );

  const staleBefore = new Date(
    now - LOCK_TIMEOUT_MS
  );

  try {
    const bookings = await db.booking.findMany({
      where: {
        status: 'PAID',
        startsAt: {
          gt: new Date(now),
          lt: windowEnd,
        },
        OR: [
          {
            startsAt: {
              gte: windowStart,
              lt: windowEnd,
            },
          },
          {
            notifications: {
              some: {
                type: 'REMINDER',
                OR: [
                  { status: 'FAILED' },
                  {
                    status: 'PROCESSING',
                    updatedAt: {
                      lt: staleBefore,
                    },
                  },
                ],
              },
            },
          },
        ],
      },
      select: {
        id: true,
      },
      orderBy: {
        startsAt: 'asc',
      },
      take: 100,
    });

    let processed = 0;
    let failed = 0;

    for (const booking of bookings) {
      try {
        await notifyBooking(
          booking.id,
          'REMINDER'
        );

        processed++;
      } catch (error) {
        failed++;

        console.error('Reminder failed', {
          bookingId: booking.id,
          error,
        });
      }
    }

    console.info('Reminder cron completed', {
      bookingsFound: bookings.length,
      processed,
      failed,
    });

    return Response.json(
      {
        success: failed === 0,
        bookingsFound: bookings.length,
        processed,
        failures: failed,
      },
      {
        status: failed > 0 ? 500 : 200,
      }
    );
  } catch (error) {
    console.error(
      'Reminder cron failed',
      error
    );

    return Response.json(
      { error: 'Unable to process reminders' },
      { status: 500 }
    );
  }
}
