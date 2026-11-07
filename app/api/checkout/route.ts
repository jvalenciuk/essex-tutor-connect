
import { db } from '../../../lib/db';
import { identity, fail } from '../../../lib/security';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const who = await identity();

  if (!who || who.role !== 'PARENT') {
    return fail('Parent account required', 403);
  }

  let bookingId: string;

  try {
    const body = await req.json();
    bookingId = body.bookingId;

    if (typeof bookingId !== 'string' || !bookingId) {
      return fail('Booking ID required', 400);
    }
  } catch {
    return fail('Invalid request', 400);
  }

  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: {
      tutor: {
        include: {
          user: { select: { name: true } },
        },
      },
    },
  });

  if (!booking || booking.parentId !== who.id) {
    return fail('Booking not found', 404);
  }

  if (booking.status !== 'PENDING_PAYMENT') {
    return fail('Booking is not awaiting payment', 409);
  }

  if (booking.startsAt <= new Date()) {
    return fail('Booking time has passed', 409);
  }

  if (!booking.tutor.stripeAccountId) {
    return fail('Tutor has not connected Stripe', 409);
  }

  if (booking.amountCents < 50) {
    return fail('Invalid booking amount', 400);
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    return fail('Stripe is not configured', 503);
  }

  const baseUrl = (
    process.env.NEXTAUTH_URL ||
    'https://essex-tutor-connect.vercel.app'
  ).replace(/\/$/, '');

  const form = new URLSearchParams();

  form.set('mode', 'payment');
  form.set('success_url', `${baseUrl}/dashboard`);
  form.set('cancel_url', `${baseUrl}/dashboard`);

  form.set('line_items[0][price_data][currency]', 'cad');
  form.set(
    'line_items[0][price_data][unit_amount]',
    String(booking.amountCents)
  );
  form.set(
    'line_items[0][price_data][product_data][name]',
    `Tutoring with ${booking.tutor.user.name}`
  );
  form.set('line_items[0][quantity]', '1');

  form.set(
    'payment_intent_data[application_fee_amount]',
    String(booking.platformFeeCents)
  );
  form.set('metadata[bookingId]', booking.id);
  form.set(
    'payment_intent_data[metadata][bookingId]',
    booking.id
  );

  try {
    const response = await fetch(
      'https://api.stripe.com/v1/checkout/sessions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Stripe-Account': booking.tutor.stripeAccountId,
          'Content-Type':
            'application/x-www-form-urlencoded',
          'Idempotency-Key':
            `checkout-${booking.id}-${Date.now()}`,
        },
        body: form.toString(),
        cache: 'no-store',
      }
    );

    const session = await response.json();

    if (!response.ok) {
      console.error('Stripe Checkout error', {
        code: session.error?.code,
        message: session.error?.message,
      });

      return fail('Unable to start payment', 502);
    }

    if (!session.id || !session.url) {
      return fail('Stripe did not return a checkout URL', 502);
    }

    await db.booking.updateMany({
      where: {
        id: booking.id,
        status: 'PENDING_PAYMENT',
        parentId: who.id,
      },
      data: {
        stripeSessionId: session.id,
      },
    });

    return Response.json({ url: session.url });
  } catch (error) {
    console.error('Checkout failed', error);
    return fail('Unable to start payment', 500);
  }
}
