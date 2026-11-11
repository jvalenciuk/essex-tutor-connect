        typeof session.payment_intent !== 'string'
      ) {
        return fail(
          'Payment verification failed. Contact support.',
          409
        );
      }

      // Re-read the booking after the Stripe lookup. The original deadline
      // check may no longer be valid if the lookup took time or the booking
      // changed while this request was in progress.
      const currentBooking = await db.booking.findUnique({
        where: { id },
        select: {
          status: true,
          startsAt: true,
          amountCents: true,
          stripeSessionId: true,
        },
      });

      if (
        !currentBooking ||
        currentBooking.status !== 'PAID' ||
        currentBooking.startsAt.getTime() !== startsAt ||
        currentBooking.amountCents !== booking.amountCents ||
        currentBooking.stripeSessionId !== sessionId
      ) {
        return fail(
          'Booking details have changed. Refresh your bookings before cancelling.',
          409
        );
      }

      const refundCheckTime = Date.now();
      if (currentBooking.startsAt.getTime() <= refundCheckTime) {
        return fail('Sessions cannot be cancelled after they begin', 409);
      }

      if (
        isParent &&
        currentBooking.startsAt.getTime() - refundCheckTime < DAY_MS
      ) {
        return fail(
          'Parents must cancel at least 24 hours before the session',
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
