import { db } from '../../../../lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Read-only diagnostic. Never changes bookings or contacts Stripe.
const AGE_MS = 24 * 60 * 60 * 1000;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('Expiration check: CRON_SECRET missing');
    return Response.json({ error: 'Not configured' }, { status: 503 });
  }

  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const now = new Date();
    const cutoff = new Date(now.getTime() - AGE_MS);

    // No Stripe session means no checkout has been attached.
    // Bookings with a Stripe session are deliberately excluded:
    // a successful payment may be awaiting webhook confirmation.
    const candidates = await db.booking.findMany({
      where: {
        status: 'PENDING_PAYMENT',
        stripeSessionId: null,
        updatedAt: { lte: cutoff },
        startsAt: { gt: now },
      },
      select: { id: true },
      take: 100,
      orderBy: { updatedAt: 'asc' },
    });

    console.info('Unpaid booking expiration dry run', {
      eligibleCount: candidates.length,
    });

    return Response.json({
      success: true,
      dryRun: true,
      eligibleCount: candidates.length,
      scannedLimit: 100,
      changedCount: 0,
      note: 'No bookings were changed. Stripe-linked bookings are excluded.',
    });
  } catch (error) {
    console.error('Unpaid booking expiration dry run failed', error);
    return Response.json({ error: 'Expiration check failed' }, { status: 500 });
  }
}
