
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

type Booking = {
  id: string;
  inquiryId: string | null;
  startsAt: string;
  durationMinutes: number;
  amountCents: number;
  platformFeeCents: number;
  status: string;
  parent?: { name: string };
  tutor?: { user: { name: string } };
  inquiry?: {
    subject: string;
    grade: string;
  } | null;
};

const labels: Record<string, string> = {
  PROPOSED: 'Session proposed',
  CHANGE_REQUESTED: 'Time change requested',
  PENDING_PAYMENT: 'Awaiting payment',
  PAID: 'Confirmed and paid',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  REFUNDED: 'Refunded',
  DECLINED: 'Declined',
};

const money = (cents: number) =>
  new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
  }).format(cents / 100);

const dateText = (value: string) =>
  new Date(value).toLocaleString('en-CA', {
    timeZone: 'America/Toronto',
    dateStyle: 'medium',
    timeStyle: 'short',
  });

function getCategory(booking: Booking) {
  const start = new Date(booking.startsAt).getTime();
  const end = start + booking.durationMinutes * 60000;
  const now = Date.now();

  if (
    ['COMPLETED', 'CANCELLED', 'REFUNDED', 'DECLINED']
      .includes(booking.status)
  ) {
    return 'history';
  }

  if (booking.status === 'PAID') {
    return end > now ? 'upcoming' : 'action';
  }

  return 'action';
}

export default function MyBookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/bookings', {
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error('Unable to load bookings.');
      }

      const data = await response.json();

      if (!Array.isArray(data)) {
        throw new Error('Unexpected booking response.');
      }

      setBookings(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load bookings.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const sorted = [...bookings].sort(
    (a, b) =>
      new Date(a.startsAt).getTime() -
      new Date(b.startsAt).getTime()
  );

  const action = sorted.filter(
    b => getCategory(b) === 'action'
  );

  const upcoming = sorted.filter(
    b => getCategory(b) === 'upcoming'
  );

  const history = sorted
    .filter(b => getCategory(b) === 'history')
    .reverse();

  function BookingCard({ booking }: { booking: Booking }) {
    const category = getCategory(booking);
    const color =
      category === 'upcoming'
        ? '#15803d'
        : category === 'action'
          ? '#b45309'
          : '#64748b';

    const now = Date.now();
    const sessionEnd =
      new Date(booking.startsAt).getTime() +
      booking.durationMinutes * 60000;

    return (
      <article
        className="card"
        style={{
          marginBottom: 14,
          borderLeft: `5px solid ${color}`,
          overflowWrap: 'anywhere',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div>
            <h3 style={{ marginTop: 0 }}>
              {booking.inquiry?.subject || 'Tutoring session'}
            </h3>
            <p>
              <strong>{dateText(booking.startsAt)}</strong>
            </p>
          </div>

          <strong style={{ color }}>
            {labels[booking.status] || booking.status}
          </strong>
        </div>

        {booking.parent?.name && (
          <p>Parent: {booking.parent.name}</p>
        )}

        {booking.tutor?.user?.name && (
          <p>Tutor: {booking.tutor.user.name}</p>
        )}

        {booking.inquiry?.grade && (
          <p>Grade: {booking.inquiry.grade}</p>
        )}

        <p>Duration: {booking.durationMinutes} minutes</p>
        <p>Session price: {money(booking.amountCents)}</p>

        {booking.status === 'PAID' && sessionEnd <= now && (
          <p className="muted">
            The session time has passed. The tutor may
            need to mark it completed.
          </p>
        )}

        {booking.status === 'PENDING_PAYMENT' && (
          <p className="muted">
            Payment is required to confirm this session.
          </p>
        )}

        {booking.status === 'CHANGE_REQUESTED' && (
          <p className="muted">
            A revised session time needs to be arranged.
          </p>
        )}

        {booking.status === 'PROPOSED' && (
          <p className="muted">
            The parent needs to respond to this proposal.
          </p>
        )}

        <Link
          href="/dashboard"
          style={{
            display: 'inline-block',
            marginTop: 10,
            padding: '10px 16px',
            background: '#123b61',
            color: '#ffffff',
            borderRadius: 8,
            textDecoration: 'none',
            fontWeight: 600,
          }}
        >
          Manage in Dashboard
        </Link>
      </article>
    );
  }

  function Section({
    title,
    items,
    empty,
  }: {
    title: string;
    items: Booking[];
    empty: string;
  }) {
    return (
      <section style={{ marginTop: 32 }}>
        <h2>{title} ({items.length})</h2>

        {items.length === 0 ? (
          <p className="muted">{empty}</p>
        ) : (
          items.map(booking => (
            <BookingCard
              key={booking.id}
              booking={booking}
            />
          ))
        )}
      </section>
    );
  }

  return (
    <main
      style={{
        maxWidth: 1080,
        margin: '0 auto',
        padding: '36px 20px',
      }}
    >
      <Link href="/dashboard">
        Back to Dashboard
      </Link>

      <h1>My Bookings</h1>

      <p className="muted">
        View your upcoming tutoring sessions, manage
        bookings that need attention, and review
        your booking history.
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            'repeat(auto-fit, minmax(190px, 1fr))',
          gap: 16,
          marginTop: 24,
        }}
      >
        {[
          ['Action Required', action.length],
          ['Upcoming Sessions', upcoming.length],
          ['Booking History', history.length],
        ].map(([label, value]) => (
          <div className="card" key={String(label)}>
            <p className="muted">{label}</p>
            <h2>{value}</h2>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => void load()}
        disabled={loading}
        style={{ marginTop: 20 }}
      >
        {loading ? 'Loading...' : 'Refresh Bookings'}
      </button>

      {error && (
        <p role="alert" style={{ color: '#b42318' }}>
          {error}
        </p>
      )}

      {!loading && !error && (
        <>
          <Section
            title="Action Required"
            items={action}
            empty="No bookings need attention."
          />

          <Section
            title="Upcoming Sessions"
            items={upcoming}
            empty="No upcoming confirmed sessions."
          />

          <Section
            title="Booking History"
            items={history}
            empty="No previous bookings yet."
          />
        </>
      )}

      <p className="muted" style={{ marginTop: 32 }}>
        Payments, cancellations, refunds, and scheduling
        changes are managed through your existing
        dashboard.
      </p>
    </main>
  );
}
