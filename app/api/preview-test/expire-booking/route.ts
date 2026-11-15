import { identity } from '../../../../lib/security';
import { db } from '../../../../lib/db';
import { expireUnpaidBookings } from '../../../../lib/payment-expiration';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const TEST_BOOKING_ID = 'cmwie6pln0001l308syy1xw5n';

export async function POST(req: Request) {
  if (process.env.VERCEL_ENV !== 'preview') return new Response('Not found', { status: 404 });
  const user = await identity();
  if (!user || user.role !== 'TUTOR') return new Response('Forbidden', { status: 403 });
  const origin = req.headers.get('origin');
  if (!origin || origin !== new URL(req.url).origin) return new Response('Forbidden', { status: 403 });
  const body = await req.json().catch(() => null);
  if (body?.bookingId !== TEST_BOOKING_ID || body?.confirm !== 'EXPIRE_PREVIEW_TEST_BOOKING') {
    return Response.json({ error: 'Invalid test confirmation' }, { status: 400 });
  }
  const booking = await db.booking.findFirst({
    where: { id: TEST_BOOKING_ID, tutor: { userId: user.id } },
    select: { id: true, status: true, paymentDueAt: true, stripeSessionId: true },
  });
  if (!booking || booking.status !== 'PENDING_PAYMENT' || !booking.paymentDueAt || booking.stripeSessionId) {
    return Response.json({ error: 'Test booking is not eligible' }, { status: 409 });
  }
  const result = await expireUnpaidBookings(undefined, { bookingId: TEST_BOOKING_ID, simulateDeadline: true });
  const updated = await db.booking.findUnique({ where: { id: TEST_BOOKING_ID }, select: { status: true } });
  return Response.json({ success: updated?.status === 'CANCELLED', status: updated?.status, result }, { headers: { 'Cache-Control': 'no-store' } });
}
