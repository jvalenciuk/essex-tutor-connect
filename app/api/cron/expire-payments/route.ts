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
      const [eligible, legacy] = await Promise.all([
        db.booking.count({ where: { status: 'PENDING_PAYMENT', paymentDueAt: { lte: new Date() } } }),
        db.booking.count({ where: { status: 'PENDING_PAYMENT', paymentDueAt: null } }),
      ]);
      return Response.json({ success: true, dryRun: true, eligible, legacyUnchanged: legacy }, {
        headers: { 'Cache-Control': 'no-store' },
      });
    }
    const expiration = await expireUnpaidBookings();
    return Response.json({ success: true, expiration }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('Scheduled payment expiration failed', error);
    return new Response('Payment expiration failed', { status: 500 });
  }
}
