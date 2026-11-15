import { db } from '../../../../lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Read-only diagnostics. Do not expose names, emails, session IDs or booking IDs.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new Response('Not configured', { status: 503 });
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const now = new Date();
    const [
      overdueUnpaid,
      legacyWithoutDeadline,
      paidWithoutCheckout,
      cancelledWithCheckout,
      failedExpirationNotifications,
      pendingExpirationNotifications,
      paidPastDeadline,
      refundedWithoutCheckout,
    ] = await Promise.all([
      db.booking.count({ where: { status: 'PENDING_PAYMENT', paymentDueAt: { lte: now } } }),
      db.booking.count({ where: { status: 'PENDING_PAYMENT', paymentDueAt: null } }),
      db.booking.count({ where: { status: 'PAID', stripeSessionId: null } }),
      db.booking.count({ where: { status: 'CANCELLED', stripeSessionId: { not: null } } }),
      db.notificationDelivery.count({ where: { type: 'PAYMENT_EXPIRED', status: 'FAILED' } }),
      db.notificationDelivery.count({ where: { type: 'PAYMENT_EXPIRED', status: { in: ['PENDING', 'PROCESSING'] } } }),
      db.booking.count({ where: { status: 'PAID', paymentDueAt: { lte: now } } }),
      db.booking.count({ where: { status: 'REFUNDED', stripeSessionId: null } }),
    ]);
    return Response.json({
      success: true,
      readOnly: true,
      checkedAt: now.toISOString(),
      counts: {
        overdueUnpaid,
        legacyWithoutDeadline,
        paidWithoutCheckout,
        cancelledWithCheckout,
        failedExpirationNotifications,
        pendingExpirationNotifications,
        paidPastDeadline,
        refundedWithoutCheckout,
      },
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('Payment health check failed', error);
    return new Response('Payment health check failed', { status: 500 });
  }
}
