
import { db } from '../../../../lib/db';
import { notifyBooking } from '../../../../lib/email';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DAY_MS = 24 * 60 * 60 * 1000;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    console.error('CRON_SECRET is missing');
    return new Response('Not configured', {
      status: 503,
    });
  }

  const authorization =
    req.headers.get('authorization');

  if (authorization !== `Bearer ${secret}`) {
    return new Response('Unauthorized', {
      status: 401,
    });
  }

  const now = new Date();

  const from = new Date(
    now.getTime() + DAY_MS
  );

  const to = new Date(
    now.getTime() + 2 * DAY_MS
  );

  try {
    const bookings = await db.booking.findMany({
      where: {
        status: 'PAID',
        startsAt: {
          gte: from,
          lt: to,
        },
      },
      select: {
        id: true,
      },
      orderBy: {
        startsAt: 'asc',
      },
      take: 100,
    });

    let sent = 0;
    let failed = 0;

    for (const booking of bookings) {
      try {
        await notifyBooking(
          booking.id,
          'REMINDER'
        );

        sent++;
      } catch (error) {
        failed++;

        console.error(
          'Reminder failed',
          {
            bookingId: booking.id,
            error,
          }
        );
      }
    }

    console.info('Booking reminder run', {
      scanned: bookings.length,
      sent,
      failed,
    });

    return Response.json(
      {
        success: failed === 0,
        scanned: bookings.length,
        sent,
        failed,
      },
      {
        status: failed > 0 ? 500 : 200,
      }
    );
  } catch (error) {
    console.error(
      'Booking reminder job failed',
      error
    );

    return new Response(
      'Reminder job failed',
      { status: 500 }
    );
  }
}
