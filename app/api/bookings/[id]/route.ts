import { getConfiguredStripeSecret } from '../../../../lib/stripe-config';

import { db } from '../../../../lib/db';
import { identity, fail } from '../../../../lib/security';
import { notifyBooking } from '../../../../lib/email';
import { checkTutorSlot } from '../../../../lib/booking-conflicts';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const DAY_MS = 24 * 60 * 60 * 1000;

const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('ACCEPT') }),
  z.object({ action: z.literal('ACCEPT_REQUESTED_TIME') }),
  z.object({ action: z.literal('DECLINE') }),
  z.object({
    action: z.literal('REQUEST_CHANGE'),
    startsAt: z.string().datetime({ offset: true }),
    durationMinutes: z.number().int().min(30).max(180),
    note: z.string().trim().max(1000).optional(),
  }),
  z.object({
    action: z.literal('REVISE'),
    startsAt: z.string().datetime({ offset: true }),
    durationMinutes: z.number().int().min(30).max(180),
  }),
  z.object({ action: z.literal('COMPLETE') }),
  z.object({ action: z.literal('CANCEL') }),
]);

async function stripeGet(
  path: string,
  secret: string,
  accountId: string
) {
  const response = await fetch(
    `https://api.stripe.com${path}`,
    {
      headers: {
        Authorization: `Bearer ${secret}`,
        'Stripe-Account': accountId,
      },
      cache: 'no-store',
    }
  );

  const result = await response.json();

  if (!response.ok) {
    console.error('Stripe lookup failed', {
      status: response.status,
      code: result.error?.code,
    });
    throw new Error('Unable to verify the Stripe payment');
  }

  return result;
}

async function stripeRefund(
  paymentIntentId: string,
  secret: string,
  accountId: string,
  bookingId: string
) {
  const form = new URLSearchParams();

  form.set('payment_intent', paymentIntentId);
  form.set('refund_application_fee', 'true');
  form.set('metadata[bookingId]', bookingId);

  const response = await fetch(
    'https://api.stripe.com/v1/refunds',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Stripe-Account': accountId,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Idempotency-Key': `booking-full-refund-${bookingId}`,
      },
      body: form.toString(),
      cache: 'no-store',
    }
  );

  const result = await response.json();

  if (!response.ok) {
    console.error('Stripe refund failed', {
      status: response.status,
      code: result.error?.code,
      message: result.error?.message,
    });

    throw new Error(
      'Stripe could not process the refund. Please try again later or contact support.'
    );
  }

  return result;
}

async function sendBookingNotification(
  bookingId: string,
  type: 'CANCELLED' | 'REFUNDED'
) {
  try {
    await notifyBooking(bookingId, type);
  } catch (error) {
    console.error('Booking notification error', error);
  }
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const who = await identity();

  if (!who) {
    return fail('Sign in required', 401);
  }

  const { id } = await context.params;

  let data: z.infer<typeof actionSchema>;

  try {
    data = actionSchema.parse(await req.json());
  } catch {
    return fail('Invalid booking action', 400);
  }

  const booking = await db.booking.findUnique({
    where: { id },
    include: { tutor: true },
  });

  if (!booking) {
    return fail('Booking not found', 404);
  }

  const isParent =
    booking.parentId === who.id &&
    who.role === 'PARENT';

  const isTutor =
    booking.tutor.userId === who.id &&
    who.role === 'TUTOR';

  if (!isParent && !isTutor) {
    return fail('Not authorized', 403);
  }

  if (data.action === 'ACCEPT') {
    if (!isParent || booking.status !== 'PROPOSED') {
      return fail('Cannot accept this booking', 409);
    }

    if (booking.startsAt.getTime() <= Date.now()) {
      return fail('The proposed session is in the past', 409);
    }

    // Serialize all acceptance attempts for this tutor, including
    // different bookings competing for the same time slot.
    // The transaction-scoped PostgreSQL advisory lock is released on commit.
    let accepted: { count: number };
    try {
      accepted = await db.$transaction(async tx => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${booking.tutorId}))`;

        const issue = await checkTutorSlot(
          booking.tutorId,
          booking.startsAt,
          booking.durationMinutes,
          booking.id,
          tx
        );
        if (issue) throw new Error(`SLOT_CONFLICT:${issue}`);

        return tx.booking.updateMany({
          where: {
            id,
            status: 'PROPOSED',
            parentId: who.id,
            startsAt: { gt: new Date() },
          },
          data: { status: 'PENDING_PAYMENT' },
        });
      });
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('SLOT_CONFLICT:')) {
        return fail(error.message.slice('SLOT_CONFLICT:'.length), 409);
      }
      console.error('Booking acceptance transaction failed', error);
      return fail('Unable to reserve the session. Please try again.', 503);
    }

    if (!accepted.count) {
      return fail('Booking is no longer available', 409);
    }

    return Response.json({
      success: true,
      status: 'PENDING_PAYMENT',
    });
  }

  // NEW: Tutor accepts the exact time proposed by the parent.
  if (data.action === 'ACCEPT_REQUESTED_TIME') {
    if (!isTutor || booking.status !== 'CHANGE_REQUESTED') {
      return fail(
        'Only the assigned tutor can accept a requested time',
        409
      );
    }

    if (
      !booking.requestedStartsAt ||
      !booking.requestedDurationMinutes
    ) {
      return fail(
        'This booking has no valid requested time',
        409
      );
    }

    const requestedStartsAt = booking.requestedStartsAt;
    const requestedDurationMinutes =
      booking.requestedDurationMinutes;

    if (requestedStartsAt.getTime() <= Date.now()) {
      return fail(
        'The requested time has passed. Propose another time.',
        409
      );
    }

    if (
      requestedDurationMinutes < 30 ||
      requestedDurationMinutes > 180
    ) {
      return fail('Invalid requested duration', 409);
    }

    const amountCents = Math.round(
      (booking.tutor.hourlyRateCents * requestedDurationMinutes) / 60
    );
    const platformFeeCents = Math.round(amountCents * 0.15);

    let acceptedRequested: { count: number };
    try {
      acceptedRequested = await db.$transaction(async tx => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${booking.tutorId}))`;

        const issue = await checkTutorSlot(
          booking.tutorId,
          requestedStartsAt,
          requestedDurationMinutes,
          booking.id,
          tx
        );
        if (issue) throw new Error(`SLOT_CONFLICT:${issue}`);

        return tx.booking.updateMany({
          where: {
            id,
            status: 'CHANGE_REQUESTED',
            tutor: { userId: who.id },
            requestedStartsAt,
            requestedDurationMinutes,
          },
          data: {
            startsAt: requestedStartsAt,
            durationMinutes: requestedDurationMinutes,
            amountCents,
            platformFeeCents,
            status: 'PENDING_PAYMENT',
            requestedStartsAt: null,
            requestedDurationMinutes: null,
            requestNote: null,
          },
        });
      });
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('SLOT_CONFLICT:')) {
        return fail(error.message.slice('SLOT_CONFLICT:'.length), 409);
      }
      console.error('Requested booking acceptance failed', error);
      return fail('Unable to reserve the requested time. Please retry.', 503);
    }

    if (!acceptedRequested.count) {
      return fail('The requested time has already changed. Refresh bookings.', 409);
    }

    return Response.json({
      success: true,
      status: 'PENDING_PAYMENT',
      startsAt: requestedStartsAt.toISOString(),
      durationMinutes: requestedDurationMinutes,
      amountCents,
    });
  }

  if (data.action === 'DECLINE') {
    if (!isParent || booking.status !== 'PROPOSED') {
      return fail('Cannot decline this booking', 409);
    }

    const result = await db.booking.updateMany({
      where: {
        id,
        status: 'PROPOSED',
        parentId: who.id,
      },
      data: { status: 'DECLINED' },
    });

    if (!result.count) {
      return fail('Booking has already changed', 409);
    }

    return Response.json({
      success: true,
      status: 'DECLINED',
    });
  }

  if (data.action === 'REQUEST_CHANGE') {
    if (!isParent || booking.status !== 'PROPOSED') {
      return fail('Cannot request a change', 409);
    }

    const requestedStartsAt = new Date(data.startsAt);

    if (requestedStartsAt.getTime() <= Date.now()) {
      return fail('Choose a future date and time', 400);
    }

    const result = await db.booking.updateMany({
      where: {
        id,
        status: 'PROPOSED',
        parentId: who.id,
      },
      data: {
        status: 'CHANGE_REQUESTED',
        requestedStartsAt,
        requestedDurationMinutes: data.durationMinutes,
        requestNote: data.note || null,
      },
    });

    if (!result.count) {
      return fail('Booking has already changed', 409);
    }

    return Response.json({
      success: true,
      status: 'CHANGE_REQUESTED',
    });
  }

  if (data.action === 'REVISE') {
    if (!isTutor || booking.status !== 'CHANGE_REQUESTED') {
      return fail('Cannot revise this booking', 409);
    }

    const startsAt = new Date(data.startsAt);

    if (startsAt.getTime() <= Date.now()) {
      return fail('Choose a future date and time', 400);
    }

    const issue = await checkTutorSlot(
      booking.tutorId,
      startsAt,
      data.durationMinutes,
      booking.id
    );

    if (issue) {
      return fail(issue, 409);
    }

    const amountCents = Math.round(
      (booking.tutor.hourlyRateCents *
        data.durationMinutes) /
        60
    );

    const platformFeeCents = Math.round(
      amountCents * 0.15
    );

    const result = await db.booking.updateMany({
      where: {
        id,
        status: 'CHANGE_REQUESTED',
        tutor: { userId: who.id },
      },
      data: {
        startsAt,
        durationMinutes: data.durationMinutes,
        amountCents,
        platformFeeCents,
        status: 'PROPOSED',
        requestedStartsAt: null,
        requestedDurationMinutes: null,
        requestNote: null,
      },
    });

    if (!result.count) {
      return fail('Booking has already changed', 409);
    }

    return Response.json({
      success: true,
      status: 'PROPOSED',
    });
  }

  if (data.action === 'COMPLETE') {
    if (!isTutor || booking.status !== 'PAID') {
      return fail(
        'Only the assigned tutor can complete a paid session',
        409
      );
    }

    const sessionEndsAt =
      booking.startsAt.getTime() +
      booking.durationMinutes * 60 * 1000;

    if (sessionEndsAt > Date.now()) {
      return fail(
        'The session must finish before it can be marked completed',
        409
      );
    }

    const result = await db.booking.updateMany({
      where: {
        id,
        status: 'PAID',
        tutor: { userId: who.id },
        startsAt: {
          lte: new Date(
            Date.now() -
              booking.durationMinutes * 60 * 1000
          ),
        },
      },
      data: { status: 'COMPLETED' },
    });

    if (!result.count) {
      return fail(
        'The session is not eligible for completion',
        409
      );
    }

    return Response.json({
      success: true,
      status: 'COMPLETED',
    });
  }

  if (data.action === 'CANCEL') {
    const now = Date.now();
    const startsAt = booking.startsAt.getTime();

    if (startsAt <= now) {
      return fail(
        'Sessions cannot be cancelled after they begin',
        409
      );
    }

    if (isParent && startsAt - now < DAY_MS) {
      return fail(
        'Parents must cancel at least 24 hours before the session',
        409
      );
    }

    if (
      booking.status === 'PROPOSED' ||
      booking.status === 'CHANGE_REQUESTED'
    ) {
      if (!isTutor) {
        return fail(
          'Parents cannot cancel proposed sessions. Use Decline when available.',
          409
        );
      }

      const result = await db.booking.updateMany({
        where: {
          id,
          status: booking.status,
          tutor: { userId: who.id },
          startsAt: { gt: new Date() },
        },
        data: { status: 'CANCELLED' },
      });

      if (!result.count) {
        return fail('Booking has already changed', 409);
      }

      await sendBookingNotification(
        booking.id,
        'CANCELLED'
      );

      return Response.json({
        success: true,
        status: 'CANCELLED',
        refunded: false,
      });
    }

    if (booking.status === 'PENDING_PAYMENT') {
      return fail(
        'This booking has an outstanding payment step. Contact support to cancel it safely.',
        409
      );
    }

    if (booking.status !== 'PAID') {
      return fail('This booking cannot be cancelled', 409);
    }

    const accountId = booking.tutor.stripeAccountId;
    const sessionId = booking.stripeSessionId;
    const secret = getConfiguredStripeSecret();

    if (!accountId || !sessionId || !secret) {
      return fail(
        'Payment details are unavailable. Contact support.',
        503
      );
    }

    try {
      const session = await stripeGet(
        `/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
        secret,
        accountId
      );

      if (
        session.payment_status !== 'paid' ||
        session.currency?.toLowerCase() !== 'cad' ||
        session.amount_total !== booking.amountCents ||
        session.metadata?.bookingId !== booking.id ||
        typeof session.payment_intent !== 'string'
      ) {
        return fail(
          'Payment verification failed. Contact support.',
          409
        );
      }

      const refund = await stripeRefund(
        session.payment_intent,
        secret,
        accountId,
        booking.id
      );

      if (refund.status !== 'succeeded') {
        return fail(
          'Stripe has not confirmed the refund yet. Please check again later.',
          409
        );
      }

      const result = await db.booking.updateMany({
        where: {
          id,
          status: 'PAID',
        },
        data: {
          status: 'REFUNDED',
        },
      });

      if (!result.count) {
        const latest = await db.booking.findUnique({
          where: { id },
          select: { status: true },
        });

        if (latest?.status === 'REFUNDED') {
          return Response.json({
            success: true,
            status: 'REFUNDED',
            refunded: true,
          });
        }

        return fail(
          'Stripe confirmed the refund, but the booking status needs administrator review.',
          409
        );
      }

      await sendBookingNotification(
        booking.id,
        'REFUNDED'
      );

      return Response.json({
        success: true,
        status: 'REFUNDED',
        refunded: true,
      });
    } catch (error) {
      console.error(
        'Booking cancellation failed',
        error
      );

      return fail(
        error instanceof Error
          ? error.message
          : 'Unable to process cancellation',
        502
      );
    }
  }

  return fail('Unsupported booking action', 400);
}
