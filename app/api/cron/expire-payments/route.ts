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

/**
 * Preview-only, authenticated single-booking test. Does not alter the
 * payment deadline or affect other bookings. Never available in Production.
 */
export async function POST(req: Request) {
  if (process.env.VERCEL_ENV !== 'preview') {
    return new Response('Preview only', { status: 403 });
  }
  const secret = process.env.CRON_SECRET;
  if (!secret) return new Response('Not configured', { status: 503 });
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  try {
    const body = await req.json().catch(() => null);
    if (
      !body ||
      typeof body.bookingId !== 'string' ||
      !/^cm[a-z0-9]{12,40}$/.test(body.bookingId) ||
      body.confirm !== 'EXPIRE_PREVIEW_TEST_BOOKING'
    ) {
      return Response.json({ error: 'Booking ID and explicit confirmation required' }, { status: 400 });
    }
    const booking = await db.booking.findUnique({
      where: { id: body.bookingId },
      select: { id: true, status: true, paymentDueAt: true, stripeSessionId: true },
    });
    if (!booking || booking.status !== 'PENDING_PAYMENT' || !booking.paymentDueAt) {
      return Response.json({ error: 'Booking is not eligible for this test' }, { status: 409 });
    }
    // Keep this test strictly to unpaid bookings without a Stripe checkout.
    if (booking.stripeSessionId) {
      return Response.json({ error: 'Checkout already started; test refused' }, { status: 409 });
    }
    const result = await expireUnpaidBookings(undefined, {
      bookingId: booking.id,
      simulateDeadline: true,
    });
    const updated = await db.booking.findUnique({
      where: { id: booking.id },
      select: { id: true, status: true, paymentDueAt: true },
    });
    return Response.json({ success: true, previewTest: true, result, booking: updated }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('Preview expiration test failed', error);
    return new Response('Preview expiration test failed', { status: 500 });
  }
}
