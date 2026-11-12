
import { db } from '../../../../../lib/db';
import { identity, fail } from '../../../../../lib/security';
import { tutorCanAcceptCardPayments } from '../../../../../lib/stripe-capabilities';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Context = {
  params: Promise<{ id: string }>;
};

type StripeSession = {
  id?: string;
  url?: string | null;
  status?: string;
  payment_status?: string;
  expires_at?: number;
};

async function stripeRequest(
  path: string,
  secretKey: string,
  accountId: string,
  options: {
    method?: 'GET' | 'POST';
    body?: URLSearchParams;
    idempotencyKey?: string;
  } = {}
): Promise<StripeSession> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${secretKey}`,
    'Stripe-Account': accountId,
  };

  if (options.body) {
    headers['Content-Type'] =
      'application/x-www-form-urlencoded';
  }

  if (options.idempotencyKey) {
    headers['Idempotency-Key'] =
      options.idempotencyKey;
  }

  const response = await fetch(
    `https://api.stripe.com${path}`,
    {
      method: options.method || 'GET',
      headers,
      body: options.body?.toString(),
      cache: 'no-store',
    }
  );

  const result = await response.json();

  if (!response.ok) {
    console.error('Stripe Checkout API error', {
      status: response.status,
      code: result.error?.code,
      message: result.error?.message,
    });

    throw new Error(
      result.error?.message || 'Stripe request failed'
    );
  }

  return result as StripeSession;
}

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

  if (booking.startsAt <= new Date()) {
    return fail(
      'This session time has passed. Arrange a new time.',
      409
    );
  }

  const accountId = booking.tutor.stripeAccountId;

  if (!accountId) {
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

  // Apply the same Stripe eligibility check as the primary checkout route.
  if (!(await tutorCanAcceptCardPayments(accountId, secretKey))) {
    return fail(
      'This tutor cannot accept card payments right now. Please try another tutor or contact support.',
      409
    );
  }

  const baseUrl = (
    process.env.NEXTAUTH_URL ||
    'https://essex-tutor-connect.vercel.app'
  ).replace(/\/$/, '');

  try {
    // Reuse an existing open Checkout session.
    if (booking.stripeSessionId) {
      const existing = await stripeRequest(
        `/v1/checkout/sessions/${encodeURIComponent(
          booking.stripeSessionId
        )}`,
        secretKey,
        accountId
      );

      if (
        existing.payment_status === 'paid'
      ) {
        return fail(
          'Payment has already been received. Refresh your bookings.',
          409
        );
      }

      if (
        existing.status === 'open' &&
        existing.url &&
        existing.expires_at &&
        existing.expires_at * 1000 > Date.now()
      ) {
        return Response.json({ url: existing.url });
      }

      if (existing.status === 'open') {
        return fail(
          'An earlier payment session is still active.',
          409
        );
      }
    }

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

    form.set('line_items[0][quantity]', '1');

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

    // Use a fresh idempotency key for a replacement
    // Checkout session after a previous one expired.
    const idempotencyKey =
      `checkout-${booking.id}-${crypto.randomUUID()}`;

    const session = await stripeRequest(
      '/v1/checkout/sessions',
      secretKey,
      accountId,
      {
        method: 'POST',
        body: form,
        idempotencyKey,
      }
    );

    if (
      typeof session.id !== 'string' ||
      typeof session.url !== 'string'
    ) {
      return fail('Invalid Stripe Checkout response', 502);
    }

    const updated = await db.booking.updateMany({
      where: {
        id: booking.id,
        parentId: who.id,
        status: 'PENDING_PAYMENT',
        stripeSessionId: booking.stripeSessionId,
      },
      data: {
        stripeSessionId: session.id,
      },
    });

    if (!updated.count) {
      // A concurrent request changed the booking.
      // Do not return this newly created session.
      try {
        await stripeRequest(
          `/v1/checkout/sessions/${encodeURIComponent(
            session.id
          )}/expire`,
          secretKey,
          accountId,
          { method: 'POST' }
        );
      } catch (expireError) {
        console.error(
          'Could not expire unused Checkout session',
          expireError
        );
      }

      return fail(
        'Booking changed. Please refresh and try again.',
        409
      );
    }

    return Response.json({ url: session.url });
  } catch (error) {
    console.error('Checkout failed', error);

    return fail(
      'Unable to start Stripe Checkout. Check the tutor Stripe account.',
      502
    );
  }
}
