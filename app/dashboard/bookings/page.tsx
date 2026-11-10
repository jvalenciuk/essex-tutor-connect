
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';

type Booking = {
  id: string;
  inquiryId: string | null;
  startsAt: string;
  durationMinutes: number;
  requestedStartsAt: string | null;
  requestedDurationMinutes: number | null;
  requestNote: string | null;
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

type Role = 'PARENT' | 'TUTOR' | 'ADMIN' | '';

const DAY_MS = 24 * 60 * 60 * 1000;

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

function money(cents: number) {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
  }).format(cents / 100);
}

function dateText(value: string) {
  return new Date(value).toLocaleString('en-CA', {
    timeZone: 'America/Toronto',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function category(booking: Booking) {
  const start = new Date(booking.startsAt).getTime();
  const end = start + booking.durationMinutes * 60000;

  if (
    ['COMPLETED', 'CANCELLED', 'REFUNDED', 'DECLINED']
      .includes(booking.status)
  ) {
    return 'history';
  }

  if (booking.status === 'PAID') {
    return end > Date.now() ? 'upcoming' : 'action';
  }

  return 'action';
}

export default function MyBookingsPage() {
  const { status: sessionStatus } = useSession();

  const [role, setRole] = useState<Role>('');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [startsAt, setStartsAt] = useState('');
  const [duration, setDuration] = useState('60');
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    setLoading(true);

    try {
      const response = await fetch('/api/bookings', {
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error('Unable to load bookings.');
      }

      const data: unknown = await response.json();

      if (!Array.isArray(data)) {
        throw new Error('Unexpected booking response.');
      }

      const serverRole = response.headers.get('X-Account-Role');

      setRole(
        serverRole === 'PARENT' ||
        serverRole === 'TUTOR' ||
        serverRole === 'ADMIN'
          ? serverRole
          : ''
      );

      setBookings(data as Booking[]);
      setError('');
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
    if (sessionStatus === 'authenticated') {
      void load();
    } else if (sessionStatus === 'unauthenticated') {
      setLoading(false);
    }
  }, [sessionStatus, load]);

  function resetEditor() {
    setEditingId(null);
    setStartsAt('');
    setDuration('60');
    setNote('');
  }

  async function updateBooking(
    bookingId: string,
    action: string,
    extra: Record<string, unknown> = {}
  ) {
    setBusyId(bookingId);
    setError('');
    setNotice('');

    try {
      const response = await fetch(
        `/api/bookings/${encodeURIComponent(bookingId)}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action,
            ...extra,
          }),
        }
      );

      const result = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          result?.error || 'Unable to update booking.'
        );
      }

      resetEditor();
      await load();
      setNotice('Booking updated successfully.');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Something went wrong.'
      );
    } finally {
      setBusyId(null);
    }
  }

  async function checkout(bookingId: string) {
    setBusyId(bookingId);
    setError('');
    setNotice('');

    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ bookingId }),
      });

      const result = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          result?.error || 'Unable to start payment.'
        );
      }

      if (
        typeof result?.url !== 'string' ||
        !result.url.startsWith(
          'https://checkout.stripe.com/'
        )
      ) {
        throw new Error('Invalid Stripe checkout link.');
      }

      window.location.assign(result.url);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to start payment.'
      );
      setBusyId(null);
    }
  }

  function beginTimeChange(booking: Booking) {
    setEditingId(booking.id);
    setStartsAt('');
    setDuration(
      String(
        booking.requestedDurationMinutes ||
          booking.durationMinutes
      )
    );
    setNote('');
    setError('');
  }

  function submitTimeChange(booking: Booking) {
    if (!startsAt) {
      setError('Please choose a date and time.');
      return;
    }

    const date = new Date(startsAt);
    const minutes = Number(duration);

    if (
      Number.isNaN(date.getTime()) ||
      date.getTime() <= Date.now()
    ) {
      setError('Please choose a future date and time.');
      return;
    }

    if (
      !Number.isInteger(minutes) ||
      minutes < 30 ||
      minutes > 180
    ) {
      setError('Duration must be between 30 and 180 minutes.');
      return;
    }

    const action =
      role === 'TUTOR' ? 'REVISE' : 'REQUEST_CHANGE';

    void updateBooking(booking.id, action, {
      startsAt: date.toISOString(),
      durationMinutes: minutes,
      ...(role === 'PARENT' ? { note } : {}),
    });
  }

  function cancelBooking(booking: Booking) {
    const paid = booking.status === 'PAID';

    const message = paid
      ? 'Cancel this paid session and request a full Stripe refund?'
      : 'Cancel this session proposal?';

    if (!window.confirm(message)) return;

    void updateBooking(booking.id, 'CANCEL');
  }

  const sorted = [...bookings].sort(
    (a, b) =>
      new Date(a.startsAt).getTime() -
      new Date(b.startsAt).getTime()
  );

  const actionItems = sorted.filter(
    b => category(b) === 'action'
  );

  const upcoming = sorted.filter(
    b => category(b) === 'upcoming'
  );

  const history = sorted
    .filter(b => category(b) === 'history')
    .reverse();

  function BookingCard({ booking }: { booking: Booking }) {
    const start = new Date(booking.startsAt).getTime();
    const end = start + booking.durationMinutes * 60000;
    const now = Date.now();

    const isBusy = busyId !== null;
    const isParent = role === 'PARENT';
    const isTutor = role === 'TUTOR';

    const parentCanCancelPaid =
      isParent &&
      booking.status === 'PAID' &&
      start - now >= DAY_MS;

    const tutorCanCancel =
      isTutor &&
      start > now &&
      ['PROPOSED', 'CHANGE_REQUESTED', 'PAID']
        .includes(booking.status);

    const canCancel =
      parentCanCancelPaid || tutorCanCancel;

    const canComplete =
      isTutor &&
      booking.status === 'PAID' &&
      end <= now;

    const section = category(booking);

    const accent =
      section === 'upcoming'
        ? '#15803d'
        : section === 'action'
          ? '#b45309'
          : '#64748b';

    return (
      <article
        className="card"
        style={{
          marginBottom: 16,
          borderLeft: `5px solid ${accent}`,
          overflowWrap: 'anywhere',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <h3 style={{ marginTop: 0 }}>
              {booking.inquiry?.subject || 'Tutoring session'}
            </h3>
            <strong>{dateText(booking.startsAt)}</strong>
          </div>

          <strong style={{ color: accent }}>
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

        {isTutor && (
          <p className="muted">
            Tutor portion before processing fees:{' '}
            {money(
              booking.amountCents -
                booking.platformFeeCents
            )}
          </p>
        )}

        {booking.inquiryId && (
          <div style={{ margin: '16px 0' }}>
            <Link
              href={`/dashboard/messages/${encodeURIComponent(
                booking.inquiryId
              )}`}
              className="button"
              style={{ display: 'inline-block' }}
            >
              {isParent
                ? 'Message Tutor'
                : isTutor
                  ? 'Message Parent'
                  : 'View Conversation'}
            </Link>
          </div>
        )}

        {booking.status === 'CHANGE_REQUESTED' && (
          <div>
            <p>
              Requested time:{' '}
              {booking.requestedStartsAt
                ? dateText(booking.requestedStartsAt)
                : 'Not provided'}
            </p>
            <p>
              Requested duration:{' '}
              {booking.requestedDurationMinutes || '—'} minutes
            </p>
            {booking.requestNote && (
              <p>Parent note: {booking.requestNote}</p>
            )}
          </div>
        )}

        {booking.status === 'PROPOSED' && isParent && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              disabled={isBusy}
              onClick={() =>
                void updateBooking(booking.id, 'ACCEPT')
              }
            >
              Accept Session
            </button>

            <button
              disabled={isBusy}
              onClick={() => beginTimeChange(booking)}
            >
              Request Different Time
            </button>

            <button
              disabled={isBusy}
              onClick={() =>
                void updateBooking(booking.id, 'DECLINE')
              }
            >
              Decline
            </button>
          </div>
        )}

        {booking.status === 'CHANGE_REQUESTED' && isTutor && (
          <button
            disabled={isBusy}
            onClick={() => beginTimeChange(booking)}
          >
            Propose Revised Session
          </button>
        )}

        {booking.status === 'PENDING_PAYMENT' && isParent && (
          <button
            disabled={isBusy}
            onClick={() => void checkout(booking.id)}
          >
            Pay {money(booking.amountCents)} Securely
          </button>
        )}

        {booking.status === 'PENDING_PAYMENT' && isTutor && (
          <p className="muted">
            Waiting for the parent to complete payment.
          </p>
        )}

        {booking.status === 'PAID' && (
          <p className="muted">
            Payment received. Session confirmed.
          </p>
        )}

        {canComplete && (
          <button
            disabled={isBusy}
            onClick={() => {
              if (
                window.confirm(
                  'Confirm this tutoring session is completed?'
                )
              ) {
                void updateBooking(booking.id, 'COMPLETE');
              }
            }}
          >
            Mark Session Completed
          </button>
        )}

        {canCancel && (
          <button
            disabled={isBusy}
            onClick={() => cancelBooking(booking)}
            style={{ marginLeft: 8 }}
          >
            {booking.status === 'PAID'
              ? 'Cancel and Refund'
              : 'Cancel Session'}
          </button>
        )}

        {isParent &&
          booking.status === 'PAID' &&
          start > now &&
          !parentCanCancelPaid && (
            <p className="muted">
              The 24-hour cancellation deadline has passed.
              Contact support for assistance.
            </p>
          )}

        {editingId === booking.id && (
          <div
            style={{
              borderTop: '1px solid #dce3ea',
              marginTop: 18,
              paddingTop: 16,
            }}
          >
            <h4>
              {isTutor
                ? 'Revise Session'
                : 'Request Different Time'}
            </h4>

            <label>
              New date and time
              <input
                className="field"
                type="datetime-local"
                value={startsAt}
                onChange={e => setStartsAt(e.target.value)}
              />
            </label>

            <label>
              Duration
              <select
                className="field"
                value={duration}
                onChange={e => setDuration(e.target.value)}
              >
                <option value="30">30 minutes</option>
                <option value="60">60 minutes</option>
                <option value="90">90 minutes</option>
                <option value="120">120 minutes</option>
                <option value="180">180 minutes</option>
              </select>
            </label>

            {isParent && (
              <label>
                Note for tutor (optional)
                <textarea
                  className="field"
                  rows={3}
                  maxLength={1000}
                  value={note}
                  onChange={e => setNote(e.target.value)}
                />
              </label>
            )}

            <div
              style={{
                display: 'flex',
                gap: 8,
                flexWrap: 'wrap',
              }}
            >
              <button
                disabled={isBusy}
                onClick={() => submitTimeChange(booking)}
              >
                Submit New Time
              </button>

              <button
                disabled={isBusy}
                onClick={resetEditor}
              >
                Close
              </button>
            </div>
          </div>
        )}
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
            <BookingCard key={booking.id} booking={booking} />
          ))
        )}
      </section>
    );
  }

  if (sessionStatus === 'loading') {
    return (
      <main>
        <p>Checking your session...</p>
      </main>
    );
  }

  if (sessionStatus === 'unauthenticated') {
    return (
      <main>
        <h1>My Bookings</h1>
        <p>Please sign in to view your bookings.</p>
        <Link href="/login">Sign In</Link>
      </main>
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
      <Link href="/dashboard">Back to Dashboard</Link>

      <h1>My Bookings</h1>

      <p className="muted">
        Manage tutoring sessions, payments, scheduling
        requests, and booking history in one place.
      </p>

      <div
        className="cards"
        style={{
          gridTemplateColumns:
            'repeat(auto-fit, minmax(190px, 1fr))',
        }}
      >
        {[
          ['Action Required', actionItems.length],
          ['Upcoming Sessions', upcoming.length],
          ['Booking History', history.length],
        ].map(([label, count]) => (
          <div className="card" key={String(label)}>
            <p className="muted">{label}</p>
            <h2>{count}</h2>
          </div>
        ))}
      </div>

      <button
        disabled={loading || busyId !== null}
        onClick={() => void load()}
      >
        {loading ? 'Loading...' : 'Refresh Bookings'}
      </button>

      {!role && !loading && (
        <p className="muted">
          Your account role could not be verified.
          Please refresh or sign in again.
        </p>
      )}

      {notice && (
        <p role="status" style={{ color: '#15803d' }}>
          {notice}
        </p>
      )}

      {error && (
        <p role="alert" style={{ color: '#b42318' }}>
          {error}
        </p>
      )}

      {!loading && (
        <>
          <Section
            title="Action Required"
            items={actionItems}
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
    </main>
  );
}
