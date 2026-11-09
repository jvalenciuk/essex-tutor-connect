
import Stripe from 'stripe';
import { db } from '../../../../lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: Request) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secretKey || !webhookSecret) {
    console.error('Stripe webhook not configured');
    return new Response('Not configured', { status: 503 });
  }

  const signature = req.headers.get('stripe-signature');

  if (!signature) {
    return new Response('Missing signature', { status: 400 });
  }

  const stripe = new Stripe(secretKey);

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      await req.text(),
      signature,
      webhookSecret
    );
  } catch (error) {
    console.error('Invalid Stripe webhook signature', error);
    return new Response('Invalid signature', { status: 400 });
  }

  const paymentSucceeded =
    event.type === 'checkout.session.completed' ||
    event.type === 'checkout.session.async_payment_succeeded';

  const paymentFailed =
    event.type === 'checkout.session.async_payment_failed';

  if (!paymentSucceeded && !paymentFailed) {
    return Response.json({ received: true });
  }

  const session = event.data.object as Stripe.Checkout.Session;

  const bookingId = session.metadata?.bookingId;

  if (!bookingId) {
    console.warn('Stripe event missing booking ID', event.id);
    return Response.json({ received: true });
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
      console.error('Stripe event references unknown booking', {
        eventId: event.id,
        bookingId,
      });

      return new Response('Booking not found', {
        status: 500,
      });
    }

    // The event must belong to the connected
    // Stripe account associated with the tutor.
    if (
      !event.account ||
      event.account !== booking.tutor.stripeAccountId
    ) {
      console.error('Stripe account mismatch', {
        eventId: event.id,
        bookingId,
      });

      return new Response('Account mismatch', {
        status: 400,
      });
    }

    // Prevent an unrelated Checkout Session
    // from modifying this booking.
    if (booking.stripeSessionId !== session.id) {
      console.error('Stripe session mismatch', {
        eventId: event.id,
        bookingId,
      });

      return new Response('Session mismatch', {
        status: 400,
      });
    }

    // A failed asynchronous payment should not
    // mark a booking paid. Keep its existing
    // status for safe follow-up.
    if (paymentFailed) {
      console.warn('Stripe asynchronous payment failed', {
        eventId: event.id,
        bookingId,
      });

      return Response.json({
        received: true,
        paymentFailed: true,
      });
    }

    // Verify payment details before changing
    // the booking's status.
    if (
      session.mode !== 'payment' ||
      session.payment_status !== 'paid' ||
      session.currency?.toLowerCase() !== 'cad' ||
      session.amount_total !== booking.amountCents ||
      session.metadata?.bookingId !== booking.id
    ) {
      console.error('Stripe payment verification failed', {
        eventId: event.id,
        bookingId,
      });

      return new Response('Payment verification failed', {
        status: 400,
      });
    }

    // Update only a booking still awaiting payment.
    // Duplicate webhook deliveries cannot mark
    // the same booking paid twice.
    const updated = await db.booking.updateMany({
      where: {
        id: booking.id,
        status: 'PENDING_PAYMENT',
        stripeSessionId: session.id,
        amountCents: session.amount_total,
      },
      data: {
        status: 'PAID',
      },
    });

    if (updated.count === 1) {
      console.info('Booking payment confirmed', {
        bookingId,
        eventId: event.id,
      });
    } else {
      console.info('Booking payment not applied', {
        bookingId,
        eventId: event.id,
        previousStatus: booking.status,
      });
    }

    return Response.json({
      received: true,
      bookingUpdated: updated.count === 1,
    });
  } catch (error) {
    console.error('Stripe webhook processing failed', {
      eventId: event.id,
      bookingId,
      error,
    });

    // A server error tells Stripe to retry
    // the event according to its retry policy.
    return new Response('Webhook processing failed', {
      status: 500,
    });
  }
}
