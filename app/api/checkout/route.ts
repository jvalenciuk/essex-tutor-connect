
import { db } from '../../../lib/db';
import { identity, fail } from '../../../lib/security';

export const dynamic = 'force-dynamic';

const STRIPE_API = 'https://api.stripe.com/v1';

type StripeCheckoutSession = {
  id?: string;
  url?: string | null;
  status?: string;
  payment_status?: string;
  expires_at?: number;
  amount_total?: number;
  currency?: string;
  metadata?: {
    bookingId?: string;
  };
  error?: {
    code?: string;
    message?: string;
  };
};

async function retrieveSession(
  sessionId: string,
  secretKey: string,
  accountId: string
): Promise<StripeCheckoutSession | null> {
  try {
    const response = await fetch(
      `${STRIPE_API}/checkout/sessions/${encodeURIComponent(sessionId)}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Stripe-Account': accountId,
        },
        cache: 'no-store',
      }
    );

    if (!response.ok) {
      console.error(
        'Unable to retrieve Stripe Checkout Session',
        response.status
      );
      return null;
    }

    return (await response.json()) as StripeCheckoutSession;
  } catch (error) {
    console.error('Stripe Checkout Session lookup failed', error);
    return null;
  }
}

export async function POST(req: Request) {
  const who = await identity();

  if (!who || who.role !== 'PARENT') {
    return fail(
      'Please sign in with a parent account to pay for a session.',
      403
    );
  }

  let bookingId: string;

  try {
    const body = await req.json();

    if (
      !body ||
      typeof body.bookingId !== 'string' ||
      !body.bookingId.trim()
    ) {
      return fail('Booking ID required', 400);
    }

    bookingId = body.bookingId.trim();
  } catch {
    return fail('Invalid payment request', 400);
  }

  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: {
      tutor: {
        include: {
          user: {
            select: { name: true },
          },
        },
      },
    },
  });

  if (!booking || booking.parentId !== who.id) {
    return fail('Booking not found', 404);
  }

  if (booking.status === 'PAID') {
    return fail(
      'This session has already been paid for. Check My Bookings.',
      409
    );
  }

  if (booking.status === 'COMPLETED') {
    return fail(
      'This session has already been completed.',
      409
    );
  }

  if (booking.status !== 'PENDING_PAYMENT') {
    return fail(
      'This booking is not awaiting payment. Refresh My Bookings to see its current status.',
      409
    );
  }

  if (booking.startsAt <= new Date()) {
    return fail(
      'The session start time has passed. Please contact your tutor to arrange a new session.',
      409
    );
  }

  if (!booking.tutor.stripeAccountId) {
    return fail(
      'This tutor has not completed payment setup. Please try again after the tutor connects Stripe.',
      409
    );
  }

  if (
    !Number.isInteger(booking.amountCents) ||
    booking.amountCents < 50 ||
    !Number.isInteger(booking.platformFeeCents) ||
    booking.platformFeeCents < 0 ||
    booking.platformFeeCents > booking.amountCents
  ) {
    return fail(
      'The booking amount is invalid. Please contact support.',
      400
    );
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    return fail(
      'Secure payment is temporarily unavailable.',
      503
    );
  }

  const accountId = booking.tutor.stripeAccountId;

  if (booking.stripeSessionId) {
    const existing = await retrieveSession(
      booking.stripeSessionId,
      secretKey,
      accountId
    );

    if (!existing) {
      return fail(
        'Unable to verify your previous payment attempt. Please try again later or contact support.',
        503
      );
    }

    if (
      existing.payment_status === 'paid' ||
      existing.status === 'complete'
    ) {
      return fail(
        'Stripe reports a completed checkout. Refresh My Bookings and allow payment confirmation to finish. Do not pay again.',
        409
      );
    }

    const matchesBooking =
      existing.metadata?.bookingId === booking.id &&
      existing.amount_total === booking.amountCents &&
      existing.currency?.toLowerCase() === 'cad';

    if (!matchesBooking) {
      return fail(
        'The previous checkout does not match this booking. Contact support before paying.',
        409
      );
    }

    if (
      existing.status === 'open' &&
      typeof existing.url === 'string' &&
      existing.url.startsWith('https://checkout.stripe.com/') &&
      typeof existing.expires_at === 'number' &&
      existing.expires_at * 1000 > Date.now() + 60 * 1000
    ) {
      return Response.json({
        url: existing.url,
        reused: true,
      });
    }

    if (
      existing.status !== 'expired' &&
      !(
        existing.status === 'open' &&
        typeof existing.expires_at === 'number' &&
        existing.expires_at * 1000 <=
          Date.now() + 60 * 1000
      )
    ) {
      return fail(
        'The previous payment attempt is being processed. Please refresh My Bookings or contact support.',
        409
      );
    }
  }

  // APP_URL allows Preview and Production to use separate
  // Stripe Checkout return URLs.
  const configuredBaseUrl =
    process.env.APP_URL ||
    process.env.NEXTAUTH_URL ||
    'https://essex-tutor-connect.vercel.app';

  let baseUrl: string;

  try {
    const parsedUrl = new URL(configuredBaseUrl);

    if (
      parsedUrl.protocol !== 'https:' ||
      parsedUrl.username ||
      parsedUrl.password ||
      parsedUrl.search ||
      parsedUrl.hash
    ) {
      throw new Error('Invalid application URL');
    }

    baseUrl = parsedUrl.origin;
  } catch {
    console.error('Invalid application base URL configuration');

    return fail(
      'Payment return URL is not configured correctly.',
      503
    );
  }

  const confirmationUrl =
    `${baseUrl}/dashboard/bookings/confirmation` +
    `?bookingId=${encodeURIComponent(booking.id)}`;

  const form = new URLSearchParams();

  form.set('mode', 'payment');
  form.set('success_url', `${confirmationUrl}&checkout=success`);
  form.set('cancel_url', `${confirmationUrl}&checkout=cancelled`);

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

  const windowNumber = Math.floor(
    Date.now() / (30 * 60 * 1000)
  );

  try {
    const response = await fetch(
      `${STRIPE_API}/checkout/sessions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Stripe-Account': accountId,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Idempotency-Key':
            `checkout-${booking.id}-${windowNumber}`,
        },
        body: form.toString(),
        cache: 'no-store',
      }
    );

    const session =
      (await response.json()) as StripeCheckoutSession;

    if (!response.ok) {
      console.error('Stripe Checkout error', {
        code: session.error?.code,
        message: session.error?.message,
      });

      return fail(
        'Stripe could not start checkout. Please try again later.',
        502
      );
    }

    if (
      typeof session.id !== 'string' ||
      typeof session.url !== 'string' ||
      !session.url.startsWith('https://checkout.stripe.com/')
    ) {
      return fail(
        'Stripe did not return a valid checkout link.',
        502
      );
    }

    const updated = await db.booking.updateMany({
      where: {
        id: booking.id,
        parentId: who.id,
        status: 'PENDING_PAYMENT',
        stripeSessionId: booking.stripeSessionId || null,
        startsAt: {
          gt: new Date(),
        },
      },
      data: {
        stripeSessionId: session.id,
      },
    });

    if (!updated.count) {
      return fail(
        'This booking changed while checkout was starting. Refresh My Bookings before trying again.',
        409
      );
    }

    return Response.json({
      url: session.url,
      reused: false,
    });
  } catch (error) {
    console.error('Checkout failed', error);

    return fail(
      'Unable to connect to secure checkout. Please try again.',
      502
    );
  }
}
