import { db } from '../../../../../lib/db';
import { identity, fail } from '../../../../../lib/security';
import { getConfiguredStripeSecret } from '../../../../../lib/stripe-config';
import { notifyBooking } from '../../../../../lib/email';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type StripeRefund = {
  id?: string;
  status?: string;
  payment_intent?: string;
  amount?: number;
  metadata?: { bookingId?: string };
};

async function stripeGet(path: string, key: string, account: string) {
  const response = await fetch(`https://api.stripe.com${path}`, {
    headers: {
      Authorization: `Bearer ${key}`,
      'Stripe-Account': account,
    },
    cache: 'no-store',
  });
  if (!response.ok) {
    console.error('Refund reconciliation Stripe lookup failed', response.status);
    throw new Error('Stripe verification unavailable');
  }
  return response.json();
}

// Explicit, single-booking reconciliation. Never issues a new refund.
export async function POST(request: Request) {
  const who = await identity();
  if (!who || who.role !== 'ADMIN') return fail('Administrator required', 403);

  let bookingId: string;
  try {
    const body = await request.json();
    if (typeof body?.bookingId !== 'string' || !body.bookingId.trim()) {
      return fail('Booking ID required', 400);
    }
    bookingId = body.bookingId.trim();
  } catch {
    return fail('Invalid request', 400);
  }

  const key = getConfiguredStripeSecret();
  if (!key) return fail('Stripe is not configured', 503);

  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: { tutor: { select: { stripeAccountId: true } } },
  });
  if (!booking) return fail('Booking not found', 404);
  if (booking.status === 'REFUNDED') {
    return Response.json({ success: true, status: 'REFUNDED', alreadyReconciled: true });
  }
  if (booking.status !== 'PAID') return fail('Booking is not eligible for refund reconciliation', 409);

  const accountId = booking.tutor.stripeAccountId;
  if (!accountId || !booking.stripeSessionId) return fail('Stripe references missing', 409);

  try {
    const session = await stripeGet(
      `/v1/checkout/sessions/${encodeURIComponent(booking.stripeSessionId)}`,
      key,
      accountId
    );

    if (
      session.payment_status !== 'paid' ||
      session.currency?.toLowerCase() !== 'cad' ||
      session.amount_total !== booking.amountCents ||
      session.metadata?.bookingId !== booking.id ||
      typeof session.payment_intent !== 'string'
    ) return fail('Stripe payment does not match booking', 409);

    const query = new URLSearchParams({
      payment_intent: session.payment_intent,
      limit: '100',
    });
    const refundList = await stripeGet(`/v1/refunds?${query}`, key, accountId);
    const refunds: StripeRefund[] = Array.isArray(refundList.data) ? refundList.data : [];

    // Fail closed on ambiguous/multiple refund records or partial refunds.
    const matching = refunds.filter(refund =>
      refund.status === 'succeeded' &&
      refund.payment_intent === session.payment_intent &&
      refund.metadata?.bookingId === booking.id &&
      refund.amount === booking.amountCents
    );

    if (refundList.has_more || matching.length !== 1 || refunds.length !== 1) {
      return fail('Refund records require manual Stripe review; no booking changes made', 409);
    }

    const result = await db.booking.updateMany({
      where: { id: booking.id, status: 'PAID', stripeSessionId: booking.stripeSessionId },
      data: { status: 'REFUNDED' },
    });

    if (!result.count) return fail('Booking changed during reconciliation. Refresh and review.', 409);

    try {
      await notifyBooking(booking.id, 'REFUNDED');
    } catch (error) {
      console.error('Refund reconciliation notification failed', error);
    }

    console.log('Administrator reconciled Stripe refund', {
      bookingId: booking.id,
      refundId: matching[0].id,
      adminId: who.id,
    });
    return Response.json({ success: true, status: 'REFUNDED', refundId: matching[0].id });
  } catch (error) {
    console.error('Refund reconciliation failed', error);
    return fail('Unable to verify refund with Stripe. No booking changes made.', 502);
  }
}
