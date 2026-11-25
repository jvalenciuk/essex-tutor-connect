import { db } from '../../../../lib/db';
import { identity, fail } from '../../../../lib/security';
import { getConfiguredStripeSecret } from '../../../../lib/stripe-config';
import { notifyBooking } from '../../../../lib/email';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// A fallback for delayed or misconfigured webhooks. This never charges a card.
export async function POST(req: Request) {
  const who = await identity();
  if (!who || who.role !== 'PARENT') return fail('Parent sign-in required', 403);

  let bookingId: string;
  try {
    const body = await req.json();
    if (typeof body?.bookingId !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(body.bookingId)) {
      return fail('Invalid booking ID', 400);
    }
    bookingId = body.bookingId;
  } catch {
    return fail('Invalid request', 400);
  }

  const booking = await db.booking.findFirst({
    where: { id: bookingId, parentId: who.id },
    select: { id: true, status: true, stripeSessionId: true, amountCents: true },
  });
  if (!booking) return fail('Booking not found', 404);
  if (booking.status === 'PAID' || booking.status === 'COMPLETED') {
    return Response.json({ confirmed: true, status: booking.status });
  }
  if (booking.status !== 'PENDING_PAYMENT') {
    return fail('Booking requires manual payment reconciliation. Do not pay again.', 409);
  }
  if (!booking.stripeSessionId) return fail('Checkout session not recorded', 409);

  const key = getConfiguredStripeSecret();
  if (!key) return fail('Stripe verification unavailable', 503);

  try {
    const response = await fetch(
      'https://api.stripe.com/v1/checkout/sessions/' + encodeURIComponent(booking.stripeSessionId),
      { headers: { Authorization: 'Bearer ' + key }, cache: 'no-store' }
    );
    if (!response.ok) return fail('Stripe verification unavailable', 503);
    const session = await response.json();
    if (session.id !== booking.stripeSessionId ||
        session.object !== 'checkout.session' ||
        session.status !== 'complete' ||
        session.payment_status !== 'paid' ||
        session.mode !== 'payment' ||
        session.livemode !== (process.env.VERCEL_ENV === 'production') ||
        session.currency?.toLowerCase() !== 'cad' ||
        session.amount_total !== booking.amountCents ||
        session.metadata?.bookingId !== booking.id ||
        session.metadata?.chargeModel !== 'destination' ||
        typeof session.payment_intent !== 'string') {
      return fail('Stripe checkout is not verified for this booking', 409);
    }

    const intentResponse = await fetch(
      'https://api.stripe.com/v1/payment_intents/' + encodeURIComponent(session.payment_intent),
      { headers: { Authorization: 'Bearer ' + key }, cache: 'no-store' }
    );
    if (!intentResponse.ok) return fail('Stripe payment verification unavailable', 503);
    const intent = await intentResponse.json();
    if (intent.status !== 'succeeded' ||
        intent.amount_received !== booking.amountCents ||
        intent.currency?.toLowerCase() !== 'cad' ||
        intent.metadata?.bookingId !== booking.id ||
        intent.metadata?.chargeModel !== 'destination' ||
        !intent.transfer_data?.destination) {
      return fail('Stripe payment details do not match booking', 409);
    }

    const result = await db.booking.updateMany({
      where: { id: booking.id, parentId: who.id, status: 'PENDING_PAYMENT', stripeSessionId: session.id },
      data: { status: 'PAID' },
    });
    if (result.count === 1) {
      try { await notifyBooking(booking.id, 'CONFIRMED'); }
      catch (error) { console.error('Reconciliation notification failed', error); }
      return Response.json({ confirmed: true, status: 'PAID' });
    }
    const latest = await db.booking.findUnique({ where: { id: booking.id }, select: { status: true } });
    if (latest?.status === 'PAID') return Response.json({ confirmed: true, status: 'PAID' });
    return fail('Booking status changed; manual reconciliation required', 409);
  } catch (error) {
    console.error('Payment reconciliation failed', error);
    return fail('Payment verification temporarily unavailable', 503);
  }
}
