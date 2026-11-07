
import { createHmac, timingSafeEqual } from 'node:crypto';
import { db } from '../../../../lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type StripeSession = {
  id: string;
  object: string;
  mode?: string;
  payment_status?: string;
  amount_total?: number | null;
  currency?: string | null;
  metadata?: Record<string, string> | null;
};

type StripeEvent = {
  id: string;
  type: string;
  livemode: boolean;
  account?: string;
  data: {
    object: StripeSession;
  };
};

function verifySignature(
  payload: string,
  header: string,
  secret: string
) {
  const parts = header.split(',');
  const timestamp = parts
    .find((part) => part.startsWith('t='))
    ?.slice(2);

  const signatures = parts
    .filter((part) => part.startsWith('v1='))
    .map((part) => part.slice(3));

  if (!timestamp || signatures.length === 0) {
    return false;
  }

  const time = Number(timestamp);

  if (
    !Number.isFinite(time) ||
    Math.abs(Date.now() / 1000 - time) > 300
  ) {
    return false;
  }

  const expected = createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`)
    .digest('hex');

  const expectedBuffer = Buffer.from(expected, 'hex');

  return signatures.some((signature) => {
    if (!/^[a-f0-9]{64}$/i.test(signature)) {
      return false;
    }

    const received = Buffer.from(signature, 'hex');

    return (
      received.length === expectedBuffer.length &&
      timingSafeEqual(received, expectedBuffer)
    );
  });
}

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get('stripe-signature');

  if (!secret || !signature) {
    return new Response('Webhook not configured', {
      status: 400,
    });
  }

  const payload = await request.text();

  if (!verifySignature(payload, signature, secret)) {
    return new Response('Invalid signature', {
      status: 400,
    });
  }

  let event: StripeEvent;

  try {
    event = JSON.parse(payload) as StripeEvent;
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  if (
    event.type !== 'checkout.session.completed' &&
    event.type !== 'checkout.session.async_payment_succeeded'
  ) {
    return Response.json({ received: true });
  }

  if (event.livemode) {
    return new Response('Live payments not enabled', {
      status: 400,
    });
  }

  const session = event.data?.object;

  if (
    session?.object !== 'checkout.session' ||
    session.mode !== 'payment' ||
    session.payment_status !== 'paid' ||
    typeof session.id !== 'string' ||
    !event.account
  ) {
    return new Response('Invalid checkout event', {
      status: 400,
    });
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
          select: { stripeAccountId: true },
        },
      },
    });

    if (
      !booking ||
      booking.tutor.stripeAccountId !== event.account ||
      booking.stripeSessionId !== session.id ||
      booking.amountCents !== session.amount_total ||
      session.currency?.toLowerCase() !== 'cad'
    ) {
      return new Response('Booking mismatch', {
        status: 400,
      });
    }

    await db.booking.updateMany({
      where: {
        id: booking.id,
        status: 'PENDING_PAYMENT',
        stripeSessionId: session.id,
      },
      data: {
        status: 'PAID',
      },
    });

    return Response.json({ received: true });
  } catch (error) {
    console.error('Stripe webhook processing failed', error);

    return new Response('Webhook processing failed', {
      status: 500,
    });
  }
}
