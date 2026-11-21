
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
type BookingTab = 'action' | 'upcoming' | 'waiting' | 'history';

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
  EXPIRED: 'Expired',
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

function category(booking: Booking, role: Role) {
  const start = new Date(booking.startsAt).getTime();
  const end = start + booking.durationMinutes * 60000;

  if (
    ['COMPLETED', 'CANCELLED', 'REFUNDED', 'DECLINED', 'EXPIRED'].includes(
      booking.status
    )
  ) {
    return 'history';
  }

  if (booking.status === 'PROPOSED' && start <= Date.now()) return 'history';

  if (booking.status === 'PAID') {
    return end > Date.now() ? 'upcoming' : 'action';
  }

  if (booking.status === 'PROPOSED' && role === 'TUTOR') return 'waiting';
  if (booking.status === 'CHANGE_REQUESTED' && role === 'PARENT') return 'waiting';
  if (booking.status === 'PENDING_PAYMENT' && role === 'TUTOR') return 'waiting';
  return 'action';
}

export default function MyBookingsPage() {
  const { status: sessionStatus } = useSession();

  const [role, setRole] = useState<Role>('');
  const [activeTab, setActiveTab] = useState<BookingTab>('action');
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedTab = params.get('tab');
    const requestedBooking = params.get('booking');
    if (requestedBooking) setFocusedBookingId(requestedBooking);
    if (requestedTab === 'action' || requestedTab === 'upcoming' || requestedTab === 'waiting' || requestedTab === 'history') {
      setActiveTab(requestedTab);
    }
  }, []);
  const [search, setSearch] = useState('');
  const [focusedBookingId, setFocusedBookingId] = useState('');
  const [showAllHistory, setShowAllHistory] = useState(false);
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
          result?.error ||
            result?.message ||
            'Unable to update booking.'
        );
      }

      resetEditor();
      await load();

      if (action === 'ACCEPT_REQUESTED_TIME') {
        setNotice(
          'Requested time accepted. The parent can now complete payment.'
        );
      } else {
        setNotice('Booking updated successfully.');
      }
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

  function acceptRequestedTime(booking: Booking) {
    if (
      !booking.requestedStartsAt ||
      !booking.requestedDurationMinutes
    ) {
      setError('The parent has not provided a valid time.');
      return;
    }

    const proposed = dateText(booking.requestedStartsAt);

    if (
      !window.confirm(
        `Accept the parent's requested time?\n\n` +
          `${proposed}\n` +
          `${booking.requestedDurationMinutes} minutes\n\n` +
          'The parent will then be able to pay for this session.'
      )
    ) {
      return;
    }

    void updateBooking(
      booking.id,
      'ACCEPT_REQUESTED_TIME'
    );
  }

  function cancelBooking(booking: Booking) {
    const paid = booking.status === 'PAID';

    const message = paid
      ? 'Cancel this paid session and request a full Stripe refund?'
      : 'Cancel this session proposal?';

    if (!window.confirm(message)) return;

    void updateBooking(booking.id, 'CANCEL');
  }

  // A direct booking link follows the session even if its status has changed.
  useEffect(() => {
    if (!focusedBookingId || loading) return;
    const selected = bookings.find(booking => booking.id === focusedBookingId);
    if (!selected) return;
    const currentTab = category(selected, role) as BookingTab;
    setActiveTab(previous => previous === currentTab ? previous : currentTab);
    setSearch('');
    setShowAllHistory(true);
  }, [focusedBookingId, bookings, role, loading]);

  const sorted = [...bookings].sort(
    (a, b) =>
      new Date(a.startsAt).getTime() -
      new Date(b.startsAt).getTime()
  );

  const actionItems = sorted.filter(
    b => category(b, role) === 'action'
  );

  const upcoming = sorted.filter(
    b => category(b, role) === 'upcoming'
  );

  const waiting = sorted.filter(b => category(b, role) === 'waiting');

  const history = sorted
    .filter(b => category(b, role) === 'history')
    .reverse();
  const tabs: { id: BookingTab; title: string; count: number; empty: string; items: Booking[] }[] = [
    { id: 'action', title: 'Needs action', count: actionItems.length, empty: 'You are all caught up.', items: actionItems },
    { id: 'upcoming', title: 'Upcoming', count: upcoming.length, empty: 'No upcoming confirmed sessions.', items: upcoming },
    { id: 'waiting', title: 'Waiting on others', count: waiting.length, empty: 'No sessions waiting on someone else.', items: waiting },
    { id: 'history', title: 'History', count: history.length, empty: 'No previous bookings yet.', items: history },
  ];
  const selectedTab = tabs.find(tab => tab.id === activeTab) || tabs[0];
  const matchingItems = selectedTab.items.filter(booking => {
    if (focusedBookingId && booking.id !== focusedBookingId) return false;
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return [booking.parent?.name, booking.tutor?.user?.name, booking.inquiry?.subject,
      booking.inquiry?.grade, labels[booking.status], booking.status,
      dateText(booking.startsAt)].some(value => value?.toLowerCase().includes(query));
  });

  const filteredItems = activeTab === 'history' && !showAllHistory
    ? matchingItems.slice(0, 5)
    : matchingItems;

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
      ['PROPOSED', 'CHANGE_REQUESTED', 'PAID'].includes(
        booking.status
      );

    const canCancel =
      parentCanCancelPaid || tutorCanCancel;

    const canComplete =
      isTutor &&
      booking.status === 'PAID' &&
      end <= now;

    const section = category(booking, role);

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
            {booking.status === 'PROPOSED' && new Date(booking.startsAt).getTime() <= Date.now() ? 'Expired' : labels[booking.status] || booking.status}
          </strong>
        </div>

        <p style={{ margin: '10px 0' }}>
          <strong>{isTutor ? booking.parent?.name || 'Parent' : booking.tutor?.user?.name || 'Tutor'}</strong>
          {booking.inquiry?.grade && <span> · {booking.inquiry.grade}</span>}
          <span> · {booking.durationMinutes} min</span>
          <span> · <strong>{money(booking.amountCents)}</strong></span>
        </p>

        <details style={{ margin: '10px 0 16px' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 500 }}>More details &amp; messages</summary>
          <div style={{ padding: '10px 0 0' }}>
            {isTutor && (
              <p className="muted">
                Estimated tutor earnings: {money(booking.amountCents - booking.platformFeeCents)}
              </p>
            )}
            {booking.inquiryId && (
              <Link href={`/dashboard/messages/${encodeURIComponent(booking.inquiryId)}`}>
                {isParent ? 'Message tutor' : isTutor ? 'Message parent' : 'View conversation'}
              </Link>
            )}
          </div>
        </details>

        {booking.status === 'CHANGE_REQUESTED' && (
          <div
            style={{
              padding: '14px 16px',
              border: '1px solid #dce3ea',
              borderRadius: 10,
              marginBottom: 16,
            }}
          >
            <strong>Parent's requested time</strong>

            <p>
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

            {isParent && (
              <p className="muted">
                Waiting for the tutor to accept your requested
                time or propose an alternative.
              </p>
            )}
          </div>
        )}

        {booking.status === 'PROPOSED' && new Date(booking.startsAt).getTime() > Date.now() && isParent && (
          <div
            style={{
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap',
            }}
          >
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

        {booking.status === 'CHANGE_REQUESTED' &&
          isTutor && (
            <div
              style={{
                display: 'flex',
                gap: 8,
                flexWrap: 'wrap',
                marginBottom: 12,
              }}
            >
              <button
                disabled={
                  isBusy ||
                  !booking.requestedStartsAt ||
                  !booking.requestedDurationMinutes
                }
                onClick={() =>
                  acceptRequestedTime(booking)
                }
              >
                Accept Requested Time
              </button>

              <button
                disabled={isBusy}
                onClick={() => beginTimeChange(booking)}
              >
                Propose Another Time
              </button>
            </div>
          )}

        {booking.status === 'PENDING_PAYMENT' &&
          isParent && (
            <button
              disabled={isBusy}
              onClick={() => void checkout(booking.id)}
            >
              Pay {money(booking.amountCents)} Securely
            </button>
          )}

        {booking.status === 'PENDING_PAYMENT' &&
          isTutor && (
            <p className="muted">
              The requested session time has been accepted.
              Waiting for the parent to complete payment.
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
                ? 'Propose Another Time'
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
                {isTutor
                  ? 'Send Alternative Proposal'
                  : 'Submit New Time'}
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
        <h2>
          {title} ({items.length})
        </h2>

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
        <h1>My Sessions</h1>
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

      <h1>My Sessions</h1>

      <p className="muted">
        See what needs your attention, what is coming up, and what is waiting on someone else.
      </p>

      <nav className="booking-tabs" aria-label="Filter tutoring sessions">
        {tabs.map(tab => (
          <button
            key={tab.id}
            type="button"
            className={activeTab === tab.id ? 'booking-tab active' : 'booking-tab'}
            aria-current={activeTab === tab.id ? 'page' : undefined}
            onClick={() => { setActiveTab(tab.id); setFocusedBookingId(''); setShowAllHistory(false); resetEditor(); setError(''); if (window.location.search) window.history.replaceState(null, '', '/dashboard/bookings'); }}
          >
            {tab.title} <span className="booking-tab-count">{tab.count}</span>
          </button>
        ))}
      </nav>

      {focusedBookingId && (
        <div role="status" style={{ marginTop: 16 }}>
          Showing your selected session. <button type="button" onClick={() => { setFocusedBookingId(''); setShowAllHistory(false); window.history.replaceState(null, '', '/dashboard/bookings'); }}>Show all sessions</button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 16 }}>
        <input
          aria-label="Search sessions"
          placeholder="Search sessions"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: '1 1 250px', padding: '11px 12px', borderRadius: 8, border: '1px solid #cbd5e1' }}
        />
        <button disabled={loading || busyId !== null} onClick={() => void load()}>
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

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
        <Section
          title={selectedTab.title}
          items={filteredItems}
          empty={search.trim() ? 'No sessions match your search.' : selectedTab.empty}
        />
      )}
      {!loading && activeTab === 'history' && matchingItems.length > 5 && (
        <div style={{ textAlign: 'center', margin: '16px 0 28px' }}>
          <p className="muted">Showing {filteredItems.length} of {matchingItems.length} historical sessions · newest dates first</p>
          <button type="button" onClick={() => setShowAllHistory(value => !value)}>
            {showAllHistory ? 'Show fewer sessions' : `Show all ${matchingItems.length} sessions`}
          </button>
        </div>
      )}
    </main>
  );
}
