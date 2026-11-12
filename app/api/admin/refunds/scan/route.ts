import { db } from '../../../../../lib/db';
import { identity, fail } from '../../../../../lib/security';
import { getConfiguredStripeSecret } from '../../../../../lib/stripe-config';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Read-only, administrator-triggered check of recent PAID bookings.
// Never changes a booking and never creates a refund.
export async function POST() {
  const who = await identity();
  if (!who?.id) return fail('Administrator required', 403);
  const admin = await db.user.findUnique({
    where: { id: who.id },
    select: { role: true },
  });
  if (admin?.role !== 'ADMIN') return fail('Administrator required', 403);

  const secret = getConfiguredStripeSecret();
  if (!secret) return fail('Stripe is not configured', 503);

  const bookings = await db.booking.findMany({
    where: { status: 'PAID', stripeSessionId: { not: null } },
    include: {
      tutor: { select: { stripeAccountId: true, user: { select: { name: true } } } },
      parent: { select: { name: true } },
    },
    orderBy: { updatedAt: 'desc' },
    take: 25,
  });

  const discrepancies: Array<{
    bookingId: string;
    tutor: string;
    parent: string;
    amountCents: number;
    status: string;
  }> = [];
  let checked = 0;
  let unavailable = 0;

  for (const booking of bookings) {
    const accountId = booking.tutor.stripeAccountId;
    if (!accountId || !booking.stripeSessionId) {
      unavailable++;
      continue;
    }
    try {
      const headers = {
        Authorization: `Bearer ${secret}`,
        'Stripe-Account': accountId,
      };
      const sessionResponse = await fetch(
        `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(booking.stripeSessionId)}`,
        { headers, cache: 'no-store' }
      );
      if (!sessionResponse.ok) { unavailable++; continue; }
      const session = await sessionResponse.json();
      if (
        session.payment_status !== 'paid' ||
        session.metadata?.bookingId !== booking.id ||
        session.currency?.toLowerCase() !== 'cad' ||
        session.amount_total !== booking.amountCents ||
        typeof session.payment_intent !== 'string'
      ) { unavailable++; continue; }

      const params = new URLSearchParams({
        payment_intent: session.payment_intent,
        limit: '100',
      });
      const refundsResponse = await fetch(
        `https://api.stripe.com/v1/refunds?${params.toString()}`,
        { headers, cache: 'no-store' }
      );
      if (!refundsResponse.ok) { unavailable++; continue; }
      const refunds = await refundsResponse.json();
      checked++;
      const all = Array.isArray(refunds.data) ? refunds.data : [];
      const matching = all.filter((refund: {
        status?: string;
        amount?: number;
        payment_intent?: string;
        metadata?: { bookingId?: string };
      }) =>
        refund.status === 'succeeded' &&
        refund.amount === booking.amountCents &&
        refund.payment_intent === session.payment_intent &&
        refund.metadata?.bookingId === booking.id
      );
      if (matching.length > 0) {
        discrepancies.push({
          bookingId: booking.id,
          tutor: booking.tutor.user.name,
          parent: booking.parent.name,
          amountCents: booking.amountCents,
          status: refunds.has_more || all.length !== 1 || matching.length !== 1
            ? 'Manual Stripe review required'
            : 'Full Stripe refund found; booking still PAID',
        });
      } else if (all.length > 0 || refunds.has_more) {
        discrepancies.push({
          bookingId: booking.id,
          tutor: booking.tutor.user.name,
          parent: booking.parent.name,
          amountCents: booking.amountCents,
          status: 'Partial or ambiguous Stripe refund; manual review required',
        });
      }
    } catch (error) {
      unavailable++;
      console.error('Refund scan failed for booking', booking.id, error);
    }
  }

  return Response.json({
    discrepancies,
    checked,
    unavailable,
    scanned: bookings.length,
    limited: bookings.length === 25,
  });
}
