
import { db } from '../../../../../lib/db';
import { identity, fail } from '../../../../../lib/security';

export const dynamic = 'force-dynamic';

type Context = {
  params: Promise<{ id: string }>;
};

export async function POST(
  _request: Request,
  context: Context
) {
  const who = await identity();

  if (!who) {
    return fail('Sign in required', 401);
  }

  if (who.role !== 'PARENT') {
    return fail('Parent account required', 403);
  }

  const { id } = await context.params;

  const booking = await db.booking.findUnique({
    where: { id },
    include: {
      tutor: true,
      parent: {
        select: { email: true },
      },
    },
  });

  if (!booking || booking.parentId !== who.id) {
    return fail('Booking not found', 404);
  }

  if (booking.status !== 'PENDING_PAYMENT') {
    return fail('Booking is not awaiting payment', 409);
  }

  if (!booking.tutor.stripeAccountId) {
    return fail('Tutor has not connected Stripe', 409);
  }

  if (
    !Number.isSafeInteger(booking.amountCents) ||
    booking.amountCents < 50 ||
    !Number.isSafeInteger(booking.platformFeeCents) ||
    booking.platformFeeCents < 0 ||
    booking.platformFeeCents > booking.amountCents ||
    booking.platformFeeCents !==
      Math.round(booking.amountCents * 0.15)
  ) {
    return fail('Invalid booking price or commission', 409);
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey || !secretKey.startsWith('sk_test_')) {
    return fail('Stripe sandbox is not configured', 503);
  }

  const baseUrl = (
    process.env.NEXTAUTH_URL ||
    'https://essex-tutor-connect.vercel.app'
  ).replace(/\/$/, '');

  const form = new URLSearchParams();

  form.set('mode', 'payment');
  form.set('payment_method_types[0]', 'card');
  form.set(
    'line_items[0][price_data][currency]',
    'cad'
  );
  form.set(
    'line_items[0][price_data][unit_amount]',
    String(booking.amountCents)
  );
  form.set(
    'line_items[0][price_data][product_data][name]',
    'Tutoring session'
  );
  form.set(
    'line_items[0][quantity]',
    '1'
  );
  form.set(
    'payment_intent_data[application_fee_amount]',
    String(booking.platformFeeCents)
  );
  form.set(
    'payment_intent_data[metadata][bookingId]',
    booking.id
  );
  form.set('metadata[bookingId]', booking.id);
  form.set('client_reference_id', booking.id);
  form.set('customer_email', booking.parent.email);
  form.set(
    'success_url',
    `${baseUrl}/dashboard?payment=success`
  );
  form.set(
    'cancel_url',
    `${baseUrl}/dashboard?payment=cancelled`
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
            `booking-checkout-${booking.id}`,
        },
        body: form.toString(),
        cache: 'no-store',
      }
    );

    const result = await response.json();

    if (!response.ok) {
      console.error('Stripe Checkout error', {
        code: result.error?.code,
        message: result.error?.message,
      });

      return fail(
        'Unable to start Stripe Checkout',
        502
      );
    }

    if (
      typeof result.id !== 'string' ||
      typeof result.url !== 'string'
    ) {
      return fail('Invalid Stripe Checkout response', 502);
    }

    await db.booking.update({
      where: { id: booking.id },
      data: {
        stripeSessionId: result.id,
      },
    });

    return Response.json({ url: result.url });
  } catch (error) {
    console.error('Checkout failed', error);

    return fail('Unable to start payment', 500);
  }
}
