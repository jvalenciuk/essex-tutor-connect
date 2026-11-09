
import { identity } from '../../lib/security';
import { db } from '../../lib/db';
import { redirect } from 'next/navigation';
import Verify from './verify';

export const dynamic = 'force-dynamic';

function money(cents: number) {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
  }).format(cents / 100);
}

function dateTime(date: Date) {
  return date.toLocaleString('en-CA', {
    timeZone: 'America/Toronto',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export default async function Admin() {
  const who = await identity();

  if (who?.role !== 'ADMIN') {
    redirect('/login');
  }

  const [tutors, bookings, bookingCounts] =
    await Promise.all([
      db.tutorProfile.findMany({
        include: {
          user: {
            select: {
              name: true,
              email: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      }),
      db.booking.findMany({
        include: {
          parent: {
            select: {
              name: true,
            },
          },
          tutor: {
            include: {
              user: {
                select: {
                  name: true,
                },
              },
            },
          },
          inquiry: {
            select: {
              subject: true,
            },
          },
        },
        orderBy: {
          startsAt: 'desc',
        },
        take: 100,
      }),
      db.booking.groupBy({
        by: ['status'],
        _count: {
          _all: true,
        },
      }),
    ]);

  const counts = Object.fromEntries(
    bookingCounts.map(item => [
      item.status,
      item._count._all,
    ])
  );

  const pendingTutors = tutors.filter(
    tutor => tutor.verification === 'PENDING'
  );

  const approvedTutors = tutors.filter(
    tutor => tutor.verification === 'APPROVED'
  );

  const pendingPayments =
    counts['PENDING_PAYMENT'] || 0;

  const paidBookings = counts['PAID'] || 0;

  const completedBookings =
    counts['COMPLETED'] || 0;

  const refundedBookings =
    counts['REFUNDED'] || 0;

  const upcoming = bookings
    .filter(
      booking =>
        booking.startsAt > new Date() &&
        (booking.status === 'PAID' ||
          booking.status === 'PENDING_PAYMENT')
    )
    .sort(
      (a, b) =>
        a.startsAt.getTime() -
        b.startsAt.getTime()
    );

  const attention = bookings.filter(
    booking =>
      booking.status === 'PENDING_PAYMENT' &&
      booking.startsAt <= new Date()
  );

  return (
    <main>
      <h1>Administrator Dashboard</h1>

      <p className="muted">
        Review tutor applications, monitor bookings,
        and identify payments requiring attention.
      </p>

      <section className="cards">
        {[
          {
            title: 'Pending tutor approvals',
            value: pendingTutors.length,
          },
          {
            title: 'Approved tutors',
            value: approvedTutors.length,
          },
          {
            title: 'Awaiting payment',
            value: pendingPayments,
          },
          {
            title: 'Paid sessions',
            value: paidBookings,
          },
          {
            title: 'Completed sessions',
            value: completedBookings,
          },
          {
            title: 'Refunded sessions',
            value: refundedBookings,
          },
        ].map(item => (
          <div className="card" key={item.title}>
            <p className="muted">{item.title}</p>
            <h2 style={{ fontSize: 30 }}>
              {item.value}
            </h2>
          </div>
        ))}
      </section>

      <section style={{ marginTop: 28 }}>
        <h2>Bookings needing attention</h2>

        <p className="muted">
          Pending-payment bookings whose start time
          has passed. Review their Stripe payment
          status before taking further action.
        </p>

        {attention.length === 0 ? (
          <p>No overdue payments in the recent booking list.</p>
        ) : (
          attention.map(booking => (
            <div className="card" key={booking.id}>
              <h3>
                {booking.inquiry?.subject || 'Tutoring'}
              </h3>

              <p>
                Parent: {booking.parent.name}
                {' · '}
                Tutor: {booking.tutor.user.name}
              </p>

              <p>
                Scheduled: {dateTime(booking.startsAt)}
              </p>

              <p>
                Amount: {money(booking.amountCents)}
              </p>

              <p>
                <strong>Status: {booking.status}</strong>
              </p>

              <p className="muted">
                Booking ID: {booking.id}
              </p>
            </div>
          ))
        )}
      </section>

      <section style={{ marginTop: 28 }}>
        <h2>Upcoming bookings</h2>

        {upcoming.length === 0 ? (
          <p>No upcoming paid or pending-payment sessions.</p>
        ) : (
          upcoming.slice(0, 20).map(booking => (
            <div className="card" key={booking.id}>
              <h3>
                {booking.inquiry?.subject || 'Tutoring'}
              </h3>

              <p>
                {booking.parent.name}
                {' with '}
                {booking.tutor.user.name}
              </p>

              <p>{dateTime(booking.startsAt)}</p>

              <p>
                {money(booking.amountCents)}
                {' · '}
                <strong>{booking.status}</strong>
              </p>
            </div>
          ))
        )}
      </section>

      <section style={{ marginTop: 28 }}>
        <h2>Tutor verification</h2>

        <p className="muted">
          Verify qualifications and required
          safeguarding documents outside the platform
          before approving tutors.
        </p>

        <h3>
          Awaiting review ({pendingTutors.length})
        </h3>

        {pendingTutors.length === 0 && (
          <p>No tutor applications awaiting review.</p>
        )}

        {[
          ...pendingTutors,
          ...tutors.filter(
            tutor => tutor.verification !== 'PENDING'
          ),
        ].map(tutor => (
          <div className="card" key={tutor.id}>
            <h3>{tutor.user.name}</h3>

            <p>{tutor.user.email}</p>

            <p>
              <strong>Status:</strong>{' '}
              {tutor.verification}
            </p>

            <p>
              <strong>Qualifications:</strong>{' '}
              {tutor.qualifications}
            </p>

            <p>
              <strong>Subjects:</strong>{' '}
              {tutor.subjects.join(', ')}
            </p>

            <p>
              <strong>Grades:</strong>{' '}
              {tutor.grades.join(', ')}
            </p>

            <p>
              <strong>Hourly rate:</strong>{' '}
              {money(tutor.hourlyRateCents)}
            </p>

            <p>
              <strong>Stripe connection:</strong>{' '}
              {tutor.stripeAccountId
                ? 'Account linked'
                : 'Not connected'}
            </p>

            <Verify id={tutor.id} />
          </div>
        ))}
      </section>

      <section className="card" style={{ marginTop: 28 }}>
        <h2>Administrator checklist</h2>

        <ol>
          <li>
            Review pending tutor applications.
          </li>
          <li>
            Verify credentials and safeguarding
            documentation outside the platform.
          </li>
          <li>
            Confirm tutors have configured availability.
          </li>
          <li>
            Check that tutors have completed
            Stripe onboarding before accepting payments.
          </li>
          <li>
            Review overdue pending payments against
            Stripe before making changes.
          </li>
          <li>
            Monitor cancellations and refunds.
          </li>
        </ol>

        <p className="muted">
          A linked Stripe account does not necessarily
          mean payouts are enabled. Confirm the account's
          status in Stripe before treating it as ready.
        </p>
      </section>
    </main>
  );
}
