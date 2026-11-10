
import Stripe from 'stripe';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { identity } from '../../../lib/security';
import { db } from '../../../lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Result = {
  id: string;
  parent: string;
  tutor: string;
  subject: string;
  startsAt: Date;
  amountCents: number;
  bookingStatus: string;
  stripeStatus: string;
  refundStatus: string;
  assessment: string;
  attention: boolean;
};

function money(cents: number) {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
  }).format(cents / 100);
}

function dateTime(value: Date) {
  return value.toLocaleString('en-CA', {
    timeZone: 'America/Toronto',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export default async function PaymentReconciliation() {
  const who = await identity();

  if (who?.role !== 'ADMIN') {
    redirect('/login');
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    return (
      <main>
        <h1>Payment Reconciliation</h1>
        <p>
          Stripe is not configured. Check
          STRIPE_SECRET_KEY in Vercel.
        </p>
      </main>
    );
  }

  const stripe = new Stripe(secretKey);

  // Read-only audit of the most recently
  // updated bookings. No database writes.
  const bookings = await db.booking.findMany({
    where: {
      status: {
        in: [
          'PENDING_PAYMENT',
          'PAID',
          'COMPLETED',
          'REFUNDED',
        ],
      },
    },
    include: {
      parent: {
        select: { name: true },
      },
      tutor: {
        select: {
          stripeAccountId: true,
          user: {
            select: { name: true },
          },
        },
      },
      inquiry: {
        select: { subject: true },
      },
    },
    orderBy: {
      updatedAt: 'desc',
    },
    take: 20,
  });

  const results: Result[] = [];

  for (const booking of bookings) {
    let stripeStatus = 'Not checked';
    let refundStatus = 'Not checked';
    let assessment = 'Review required';
    let attention = true;

    const accountId =
      booking.tutor.stripeAccountId;

    const sessionId =
      booking.stripeSessionId;

    if (!accountId) {
      assessment =
        'Tutor has no linked Stripe account';
    } else if (!sessionId) {
      stripeStatus = 'No Checkout Session';

      if (booking.status === 'PENDING_PAYMENT') {
        assessment =
          'Checkout has not been recorded';
        attention = false;
      } else {
        assessment =
          'Booking indicates payment but has no Stripe session';
      }
    } else {
      try {
        const session =
          await stripe.checkout.sessions.retrieve(
            sessionId,
            {
              expand: ['payment_intent'],
            },
            {
              stripeAccount: accountId,
            }
          );

        const matches =
          session.id === sessionId &&
          session.metadata?.bookingId ===
            booking.id &&
          session.currency?.toLowerCase() ===
            'cad' &&
          session.amount_total ===
            booking.amountCents &&
          session.mode === 'payment';

        stripeStatus =
          `${session.status || 'unknown'} / ` +
          `${session.payment_status || 'unknown'}`;

        if (!matches) {
          assessment =
            'Stripe session details do not match booking';
        } else {
          const paymentIntent =
            session.payment_intent;

          let refundedCents = 0;
          let pendingRefundCents = 0;

          if (
            paymentIntent &&
            typeof paymentIntent !== 'string'
          ) {
            const refunds = await stripe.refunds.list(
              {
                payment_intent: paymentIntent.id,
                limit: 100,
              },
              {
                stripeAccount: accountId,
              }
            );

            for (const refund of refunds.data) {
              if (refund.status === 'succeeded') {
                refundedCents += refund.amount;
              } else if (
                refund.status === 'pending'
              ) {
                pendingRefundCents += refund.amount;
              }
            }

            refundStatus =
              `Succeeded: ${money(refundedCents)}` +
              (pendingRefundCents > 0
                ? `; pending: ${money(pendingRefundCents)}`
                : '');

            if (refunds.has_more) {
              assessment =
                'Refund list is incomplete; manual review required';
            }
          } else {
            refundStatus =
              'PaymentIntent unavailable';
          }

          if (
            assessment !==
            'Refund list is incomplete; manual review required'
          ) {
            if (
              session.payment_status === 'paid' &&
              booking.status ===
                'PENDING_PAYMENT'
            ) {
              assessment =
                'PAYMENT RECEIVED: booking still awaiting payment';
            } else if (
              session.payment_status !== 'paid' &&
              (
                booking.status === 'PAID' ||
                booking.status === 'COMPLETED'
              )
            ) {
              assessment =
                'Booking marked paid without confirmed Stripe payment';
            } else if (
              booking.status === 'REFUNDED'
            ) {
              if (
                refundedCents >=
                booking.amountCents
              ) {
                assessment =
                  'Full refund confirmed';
                attention = false;
              } else {
                assessment =
                  'Refunded booking: full refund not verified';
              }
            } else if (
              refundedCents > 0 ||
              pendingRefundCents > 0
            ) {
              assessment =
                'Stripe refund detected; verify booking status';
            } else if (
              session.payment_status === 'paid' &&
              (
                booking.status === 'PAID' ||
                booking.status === 'COMPLETED'
              )
            ) {
              assessment =
                'Payment matches booking';
              attention = false;
            } else if (
              booking.status ===
                'PENDING_PAYMENT' &&
              session.payment_status !== 'paid'
            ) {
              assessment =
                'Payment not yet confirmed';
              attention =
                booking.startsAt <= new Date();
            } else {
              assessment =
                'Review payment status manually';
            }
          }
        }
      } catch (error) {
        console.error(
          'Stripe reconciliation lookup failed',
          {
            bookingId: booking.id,
            error,
          }
        );

        stripeStatus = 'Lookup failed';
        assessment =
          'Unable to verify payment with Stripe';
      }
    }

    results.push({
      id: booking.id,
      parent: booking.parent.name,
      tutor: booking.tutor.user.name,
      subject:
        booking.inquiry?.subject || 'Tutoring',
      startsAt: booking.startsAt,
      amountCents: booking.amountCents,
      bookingStatus: booking.status,
      stripeStatus,
      refundStatus,
      assessment,
      attention,
    });
  }

  const issues = results.filter(
    result => result.attention
  );

  const clear = results.filter(
    result => !result.attention
  );

  return (
    <main>
      <p>
        <Link href="/admin">
          Back to Administrator Dashboard
        </Link>
      </p>

      <h1>Payment Reconciliation</h1>

      <p className="muted">
        Compare booking records against Stripe
        Checkout payments and refunds.
        This page is read-only.
      </p>

      <section className="cards">
        <div className="card">
          <h2>{results.length}</h2>
          <p>Bookings checked</p>
        </div>

        <div className="card">
          <h2>{issues.length}</h2>
          <p>Require attention</p>
        </div>

        <div className="card">
          <h2>{clear.length}</h2>
          <p>No immediate issue detected</p>
        </div>
      </section>

      <p className="muted">
        Showing up to 20 recently updated
        payment-related bookings. This is not
        a complete financial audit.
      </p>

      <section style={{ marginTop: 28 }}>
        <h2>Bookings requiring attention</h2>

        {issues.length === 0 ? (
          <p>
            No issues detected in the checked bookings.
          </p>
        ) : (
          issues.map(item => (
            <div className="card" key={item.id}>
              <h3>{item.subject}</h3>

              <p>
                <strong>
                  {item.assessment}
                </strong>
              </p>

              <p>
                Parent: {item.parent}
                {' · '}
                Tutor: {item.tutor}
              </p>

              <p>
                Session: {dateTime(item.startsAt)}
              </p>

              <p>
                Amount: {money(item.amountCents)}
              </p>

              <p>
                Database: {item.bookingStatus}
              </p>

              <p>
                Stripe: {item.stripeStatus}
              </p>

              <p>
                Refunds: {item.refundStatus}
              </p>

              <p className="muted">
                Booking ID: {item.id}
              </p>
            </div>
          ))
        )}
      </section>

      <section style={{ marginTop: 28 }}>
        <h2>Other checked bookings</h2>

        {clear.length === 0 ? (
          <p>No additional bookings to display.</p>
        ) : (
          clear.map(item => (
            <div className="card" key={item.id}>
              <h3>{item.subject}</h3>

              <p>
                <strong>
                  {item.assessment}
                </strong>
              </p>

              <p>
                {item.parent}
                {' with '}
                {item.tutor}
              </p>

              <p>
                {dateTime(item.startsAt)}
                {' · '}
                {money(item.amountCents)}
              </p>

              <p>
                Database: {item.bookingStatus}
              </p>

              <p>
                Stripe: {item.stripeStatus}
              </p>

              <p>
                Refunds: {item.refundStatus}
              </p>

              <p className="muted">
                Booking ID: {item.id}
              </p>
            </div>
          ))
        )}
      </section>

      <section
        className="card"
        style={{ marginTop: 28 }}
      >
        <h2>Reconciliation safeguards</h2>

        <p>
          This dashboard does not charge customers,
          issue refunds, or modify booking records.
        </p>

        <p>
          If Stripe confirms payment but the booking
          remains pending, investigate the webhook
          before making a correction.
        </p>

        <p>
          Refund checks are based on Stripe refund
          records. Refunds that are still pending
          are not treated as completed.
        </p>

        <p>
          For production accounting, also reconcile
          Stripe balances, application fees, disputes,
          and payouts.
        </p>
      </section>
    </main>
  );
}
