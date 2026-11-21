import { expireUnpaidBookings } from '../../../../lib/payment-expiration';
import { db } from '../../../../lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('CRON_SECRET is missing');
    return new Response('Not configured', { status: 503 });
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const dryRun = new URL(req.url).searchParams.get('dryRun') === 'true';
    if (dryRun) {
      const now = new Date();
      const [eligible, legacyFuture] = await Promise.all([
        db.booking.count({
          where: {
            status: 'PENDING_PAYMENT',
            OR: [
              { paymentDueAt: { lte: now } },
              { startsAt: { lte: now } },
            ],
          },
        }),
        db.booking.count({
          where: {
            status: 'PENDING_PAYMENT',
            paymentDueAt: null,
            startsAt: { gt: now },
          },
        }),
      ]);
      return Response.json({ success: true, dryRun: true, eligible, legacyFutureUnchanged: legacyFuture }, {
        headers: { 'Cache-Control': 'no-store' },
      });
    }
    const expiration = await expireUnpaidBookings();
    const now = new Date();
    const proposals = await db.booking.updateMany({
      where: { status: 'PROPOSED', startsAt: { lte: now } },
      data: { status: 'EXPIRED' },
    });
    return Response.json({ success: true, expiration, expiredProposals: proposals.count }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('Scheduled payment expiration failed', error);
    return new Response('Payment expiration failed', { status: 500 });
  }
}
