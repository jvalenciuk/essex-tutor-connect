
import { createHmac, timingSafeEqual } from 'node:crypto';
import { db } from '../../../../lib/db';

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
    .find((part) => part.startsWith('t='))
    ?.slice(2);

  const signatures = parts
    .filter((part) => part.startsWith('v1='))
    .map((part) => part.slice(3));

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

  const successfulEvents = [
    'checkout.session.completed',
    'checkout.session.async_payment_succeeded',
  ];

  if (!successfulEvents.includes(event.type)) {
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

    // Connected-account webhooks contain event.account.
    // Platform-account webhooks generally do not.
    // When present, verify that the connected account
    // belongs to the tutor for this booking.
    if (
      event.account &&
      booking.tutor.stripeAccountId !== event.account
    ) {
      return new Response('Connected account mismatch', {
        status: 400,
      });
    }

    // Update only bookings still awaiting payment.
    // Duplicate webhook deliveries will not update
    // the booking again.
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

    return Response.json({ received: true });
  } catch (error) {
    console.error('Webhook processing failed', error);

    return new Response('Webhook processing failed', {
      status: 500,
    });
  }
}
