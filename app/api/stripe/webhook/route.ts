
import { createHmac, timingSafeEqual } from 'node:crypto';
import { db } from '../../../../lib/db';
import { notifyBooking } from '../../../../lib/email';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type CheckoutSession = {
  id: string;
  object?: string;
  payment_status?: string;
  amount_total?: number;
  currency?: string;
  metadata?: {
    bookingId?: string;
  };
};

type StripeEvent = {
  id: string;
  type: string;
  account?: string;
  data: {
    object: CheckoutSession;
  };
};

function verifySignature(
  payload: string,
  header: string,
  secret: string
): boolean {
  const parts = header.split(',').map((p) => p.trim());

  const timestamp = parts
    .find((p) => p.startsWith('t='))
    ?.slice(2);

  const signatures = parts
    .filter((p) => p.startsWith('v1='))
    .map((p) => p.slice(3));

  if (!timestamp || signatures.length === 0) {
    return false;
  }

  const timestampNumber = Number(timestamp);

  if (
    !Number.isSafeInteger(timestampNumber) ||
    Math.abs(Date.now() / 1000 - timestampNumber) > 300
  ) {
    return false;
  }

  const expected = createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`)
    .digest();

  return signatures.some((signature) => {
    if (!/^[a-f0-9]{64}$/i.test(signature)) {
      return false;
    }

    const actual = Buffer.from(signature, 'hex');

    return timingSafeEqual(expected, actual);
  });
}

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = req.headers.get('stripe-signature');

  if (!secret || !signature) {
    return new Response('Webhook not configured', {
      status: 400,
    });
  }

  const payload = await req.text();

  if (!verifySignature(payload, signature, secret)) {
    return new Response('Invalid signature', {
      status: 400,
    });
  }

  let event: StripeEvent;

  try {
    event = JSON.parse(payload) as StripeEvent;
  } catch {
    return new Response('Invalid event', {
      status: 400,
    });
  }

  // Stripe refund events can arrive after a successful refund while
  // the local database still says PAID. Verify against Stripe before
  // changing the booking; never create a refund from a webhook.
  if (event.type === 'refund.updated' || event.type === 'refund.created') {
    const refund = event.data?.object;
    const bookingId = refund?.metadata?.bookingId;
    if (!bookingId || refund?.status !== 'succeeded' || !event.account) {
      return Response.json({ received: true });
    }

    try {
      const booking = await db.booking.findUnique({
        where: { id: bookingId },
        include: { tutor: { select: { stripeAccountId: true } } },
      });
      if (
        !booking ||
        booking.status !== 'PAID' ||
        booking.tutor.stripeAccountId !== event.account ||
        !booking.stripeSessionId ||
        refund.amount !== booking.amountCents ||
        typeof refund.payment_intent !== 'string'
      ) return Response.json({ received: true });

      const key = process.env.STRIPE_SECRET_KEY;
      if (!key) return new Response('Stripe unavailable', { status: 503 });

      const sessionResponse = await fetch(
        `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(booking.stripeSessionId)}`,
        {
          headers: { Authorization: `Bearer ${key}`, 'Stripe-Account': event.account },
          cache: 'no-store',
        }
      );
      if (!sessionResponse.ok) return new Response('Stripe verification unavailable', { status: 503 });
      const session = await sessionResponse.json();
      if (
        session.payment_intent !== refund.payment_intent ||
        session.payment_status !== 'paid' ||
        session.currency?.toLowerCase() !== 'cad' ||
        session.amount_total !== booking.amountCents ||
        session.metadata?.bookingId !== booking.id
      ) return new Response('Refund payment mismatch', { status: 409 });

      const result = await db.booking.updateMany({
        where: { id: booking.id, status: 'PAID', stripeSessionId: booking.stripeSessionId },
        data: { status: 'REFUNDED' },
      });
      if (result.count) {
        try { await notifyBooking(booking.id, 'REFUNDED'); }
        catch (error) { console.error('Refund notification failed', error); }
      }
      return Response.json({ received: true, reconciled: result.count === 1 });
    } catch (error) {
      console.error('Refund webhook reconciliation failed', error);
      return new Response('Refund reconciliation failed', { status: 500 });
    }
  }

  if (
    event.type !== 'checkout.session.completed' &&
    event.type !== 'checkout.session.async_payment_succeeded'
  ) {
    return Response.json({ received: true });
  }

  const session = event.data?.object;

  if (
    !session ||
    session.object !== 'checkout.session' ||
    typeof session.id !== 'string' ||
    session.payment_status !== 'paid'
  ) {
    return Response.json({ received: true });
  }

  const bookingId = session.metadata?.bookingId;

  if (!bookingId) {
    return new Response('Missing booking ID', {
      status: 400,
    });
  }

  try {
    const booking = await db.booking.findUnique({
      where: { id: bookingId },
      include: {
        tutor: {
          select: {
            stripeAccountId: true,
          },
        },
      },
    });

    if (!booking) {
      return new Response('Booking not found', {
        status: 404,
      });
    }

    if (
      booking.stripeSessionId !== session.id ||
      session.currency?.toLowerCase() !== 'cad' ||
      session.amount_total !== booking.amountCents
    ) {
      console.error('Stripe payment details mismatch', {
        bookingId,
        sessionId: session.id,
      });

      return new Response('Payment details mismatch', {
        status: 400,
      });
    }

    // Payments use direct charges on connected accounts.
    if (
      !event.account ||
      booking.tutor.stripeAccountId !== event.account
    ) {
      return new Response('Connected account mismatch', {
        status: 400,
      });
    }

    const result = await db.booking.updateMany({
      where: {
        id: booking.id,
        status: 'PENDING_PAYMENT',
        stripeSessionId: session.id,
      },
      data: {
        status: 'PAID',
      },
    });

    console.log('Stripe webhook processed', {
      bookingId,
      updated: result.count,
      eventType: event.type,
    });

    // Only notify when this event actually changed the status.
    // Stripe may deliver the same event more than once.
    if (result.count === 1) {
      try {
        await notifyBooking(booking.id, 'CONFIRMED');
      } catch (error) {
        console.error(
          'Booking confirmation notification failed',
          error
        );
      }
    }

    return Response.json({ received: true });
  } catch (error) {
    console.error('Webhook processing failed', error);

    return new Response('Webhook processing failed', {
      status: 500,
    });
  }
}
