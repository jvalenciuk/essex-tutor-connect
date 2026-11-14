import { db } from './db';
import { getConfiguredStripeSecret } from './stripe-config';

const STRIPE = 'https://api.stripe.com/v1';
export const PAYMENT_WINDOW_MS = 24 * 60 * 60 * 1000;

// Existing reservations with no deadline are intentionally grandfathered.
export async function expireUnpaidBookings(tutorId?: string) {
  const now = new Date();
  const bookings = await db.booking.findMany({
    where: {
      status: 'PENDING_PAYMENT',
      paymentDueAt: { lte: now },
      ...(tutorId ? { tutorId } : {}),
    },
    include: { tutor: { select: { stripeAccountId: true } } },
    take: 100,
  });
  let expired = 0;
  let deferred = 0;
  for (const booking of bookings) {
    // Never release a slot if payment might have succeeded.
    if (booking.stripeSessionId) {
      const secret = getConfiguredStripeSecret();
      const account = booking.tutor.stripeAccountId;
      if (!secret || !account) { deferred++; continue; }
      try {
        const headers = {
          Authorization: `Bearer ${secret}`,
          'Stripe-Account': account,
        };
        const response = await fetch(
          `${STRIPE}/checkout/sessions/${encodeURIComponent(booking.stripeSessionId)}`,
          { headers, cache: 'no-store' }
        );
        if (!response.ok) { deferred++; continue; }
        const session = await response.json();
        if (session.payment_status === 'paid' || session.status === 'complete') {
          // A delayed webhook must still be allowed to confirm this payment.
          deferred++;
          continue;
        }
        if (session.status === 'open') {
          const expire = await fetch(
            `${STRIPE}/checkout/sessions/${encodeURIComponent(booking.stripeSessionId)}/expire`,
            { method: 'POST', headers, cache: 'no-store' }
          );
          if (!expire.ok) { deferred++; continue; }
        } else if (session.status !== 'expired') {
          deferred++;
          continue;
        }
      } catch (error) {
        console.error('Unable to safely expire Stripe checkout', booking.id, error);
        deferred++;
        continue;
      }
    }
    const result = await db.booking.updateMany({
      where: {
        id: booking.id,
        status: 'PENDING_PAYMENT',
        paymentDueAt: { lte: now },
      },
      data: { status: 'CANCELLED' },
    });
    expired += result.count;
  }
  return { scanned: bookings.length, expired, deferred };
}
