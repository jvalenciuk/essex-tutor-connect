
'use client';

import { useCallback, useEffect, useState } from 'react';
import SessionCalendar from './session-calendar';

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
};

type Props = {
  inquiryId: string;
  role: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function formatDate(value: string) {
  return new Date(value).toLocaleString('en-CA', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: 'America/Toronto',
  });
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
  }).format(cents / 100);
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    PROPOSED: 'Waiting for parent response',
    CHANGE_REQUESTED: 'Parent requested a different time',
    DECLINED: 'Declined',
    PENDING_PAYMENT: 'Agreed — awaiting payment',
    PAID: 'Paid',
    COMPLETED: 'Completed',
    CANCELLED: 'Cancelled',
    REFUNDED: 'Refunded',
  };

  return labels[status] || status;
}

export default function BookingManager({
  inquiryId,
  role,
}: Props) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [startsAt, setStartsAt] = useState('');
  const [duration, setDuration] = useState('60');
  const [note, setNote] = useState('');
  const [changingId, setChangingId] = useState<string | null>(
    null
  );

  const loadBookings = useCallback(async () => {
    try {
      const response = await fetch('/api/bookings', {
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error('Could not load bookings');
      }

      const data: Booking[] = await response.json();

      setBookings(
        data.filter((item) => item.inquiryId === inquiryId)
      );

      setError('');
    } catch {
      setError('Unable to load bookings.');
    } finally {
      setLoading(false);
    }
  }, [inquiryId]);

  useEffect(() => {
    void loadBookings();
  }, [loadBookings]);

  function resetForm() {
    setStartsAt('');
    setDuration('60');
    setNote('');
    setChangingId(null);
  }

  async function sendRequest(
    url: string,
    method: 'POST' | 'PATCH',
    payload: object,
    successMessage = 'Booking updated successfully.'
  ) {
    setBusy(true);
    setError('');
    setNotice('');

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const result = await response.json().catch(() => null);

        throw new Error(
          result?.error || 'Unable to update booking'
        );
      }

      resetForm();
      await loadBookings();
      setNotice(successMessage);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Something went wrong.'
      );
    } finally {
      setBusy(false);
    }
  }

  async function startCheckout(bookingId: string) {
    setBusy(true);
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
        !result.url.startsWith('https://checkout.stripe.com/')
      ) {
        throw new Error('The payment link was not valid.');
      }

      window.location.assign(result.url);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to start payment.'
      );
      setBusy(false);
    }
  }

  function datePayload() {
    if (!startsAt) {
      setError('Please choose a date and time.');
      return null;
    }

    const date = new Date(startsAt);
    const minutes = Number(duration);

    if (
      Number.isNaN(date.getTime()) ||
      date.getTime() <= Date.now()
    ) {
      setError('Please choose a future date and time.');
      return null;
    }

    if (
      !Number.isInteger(minutes) ||
      minutes < 30 ||
      minutes > 180
    ) {
      setError(
        'Choose a duration between 30 and 180 minutes.'
      );
      return null;
    }

    return {
      startsAt: date.toISOString(),
      durationMinutes: minutes,
    };
  }

  function submitProposal() {
    const details = datePayload();

    if (!details) return;

    void sendRequest(
      '/api/bookings',
      'POST',
      {
        inquiryId,
        ...details,
      },
      'New session proposed successfully.'
    );
  }

  function submitChange(bookingId: string) {
    const details = datePayload();

    if (!details) return;

    void sendRequest(
      `/api/bookings/${encodeURIComponent(bookingId)}`,
      'PATCH',
      {
        action:
          role === 'TUTOR'
            ? 'REVISE'
            : 'REQUEST_CHANGE',
        ...details,
        ...(role === 'PARENT' ? { note } : {}),
      }
    );
  }

  function respond(
    bookingId: string,
    action: 'ACCEPT' | 'DECLINE' | 'COMPLETE'
  ) {
    void sendRequest(
      `/api/bookings/${encodeURIComponent(bookingId)}`,
      'PATCH',
      { action }
    );
  }

  function cancelBooking(booking: Booking) {
    const isPaid = booking.status === 'PAID';

    const message = isPaid
      ? 'Cancel this tutoring session and request a full refund through Stripe?'
      : 'Cancel this tutoring session proposal?';

    if (!window.confirm(message)) return;

    void sendRequest(
      `/api/bookings/${encodeURIComponent(booking.id)}`,
      'PATCH',
      { action: 'CANCEL' },
      isPaid
        ? 'Cancellation processed. Stripe refund confirmed.'
        : 'Booking cancelled successfully.'
    );
  }

  const canPropose =
    role === 'TUTOR' &&
    !loading &&
    !busy;

  function dateFields() {
    return (
      <div style={{ marginTop: 12 }}>
        <label>
          <strong>Date and time</strong>
          <input
            type="datetime-local"
            value={startsAt}
            onChange={(e) =>
              setStartsAt(e.target.value)
            }
            required
            style={{
              display: 'block',
              padding: 10,
              margin: '8px 0',
            }}
          />
        </label>

        <label>
          <strong>Session duration</strong>
          <select
            value={duration}
            onChange={(e) =>
              setDuration(e.target.value)
            }
            style={{
              display: 'block',
              padding: 10,
              margin: '8px 0',
            }}
          >
            <option value="30">30 minutes</option>
            <option value="60">60 minutes</option>
            <option value="90">90 minutes</option>
            <option value="120">120 minutes</option>
            <option value="180">180 minutes</option>
          </select>
        </label>
      </div>
    );
  }

  return (
    <section
      style={{
        marginTop: 20,
        paddingTop: 16,
        borderTop: '1px solid #ddd',
      }}
    >
      <h3>Session bookings</h3>

      {/* NEW: Monthly tutoring calendar */}
      <SessionCalendar role={role} />

      {loading && <p>Loading bookings...</p>}

      {!loading && bookings.length === 0 && (
        <p>No session proposals yet.</p>
      )}

      {bookings.map((booking) => {
        const startTime =
          new Date(booking.startsAt).getTime();

        const sessionEndsAt =
          startTime +
          booking.durationMinutes * 60 * 1000;

        const canComplete =
          role === 'TUTOR' &&
          booking.status === 'PAID' &&
          sessionEndsAt <= Date.now();

        const beforeSession = startTime > Date.now();

        const parentCanCancel =
          role === 'PARENT' &&
          startTime - Date.now() >= DAY_MS;

        const tutorCanCancel =
          role === 'TUTOR' && beforeSession;

        const canCancel =
          (parentCanCancel || tutorCanCancel) &&
          [
            'PROPOSED',
            'CHANGE_REQUESTED',
            'PAID',
          ].includes(booking.status);

        return (
          <div
            key={booking.id}
            style={{
              padding: 16,
              margin: '12px 0',
              border: '1px solid #ddd',
              borderRadius: 8,
            }}
          >
            <p>
              <strong>
                Status: {statusLabel(booking.status)}
              </strong>
            </p>

            <p>
              <strong>Proposed session:</strong>{' '}
              {formatDate(booking.startsAt)}
            </p>

            <p>
              <strong>Duration:</strong>{' '}
              {booking.durationMinutes} minutes
            </p>

            <p>
              <strong>Session price:</strong>{' '}
              {formatMoney(booking.amountCents)}
            </p>

            {role === 'TUTOR' && (
              <>
                <p>
                  <strong>
                    Platform commission (15%):
                  </strong>{' '}
                  {formatMoney(booking.platformFeeCents)}
                </p>

                <p>
                  <strong>
                    Tutor portion before processing fees:
                  </strong>{' '}
                  {formatMoney(
                    booking.amountCents -
                      booking.platformFeeCents
                  )}
                </p>
              </>
            )}

            {booking.status === 'PROPOSED' &&
              role === 'PARENT' && (
                <div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      respond(booking.id, 'ACCEPT')
                    }
                  >
                    Accept session
                  </button>{' '}

                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setChangingId(
                        changingId === booking.id
                          ? null
                          : booking.id
                      );
                      setStartsAt('');
                      setDuration(
                        String(booking.durationMinutes)
                      );
                      setError('');
                    }}
                  >
                    Request different time
                  </button>{' '}

                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      respond(booking.id, 'DECLINE')
                    }
                  >
                    Decline
                  </button>
                </div>
              )}

            {booking.status === 'CHANGE_REQUESTED' && (
              <div>
                <p>
                  <strong>
                    Parent&apos;s requested time:
                  </strong>{' '}
                  {booking.requestedStartsAt
                    ? formatDate(booking.requestedStartsAt)
                    : 'Not provided'}
                </p>

                <p>
                  <strong>Requested duration:</strong>{' '}
                  {booking.requestedDurationMinutes} minutes
                </p>

                {booking.requestNote && (
                  <p>
                    <strong>Parent&apos;s note:</strong>{' '}
                    {booking.requestNote}
                  </p>
                )}

                {role === 'TUTOR' && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setChangingId(
                        changingId === booking.id
                          ? null
                          : booking.id
                      );
                      setStartsAt('');
                      setDuration(
                        String(
                          booking.requestedDurationMinutes ||
                            booking.durationMinutes
                        )
                      );
                      setError('');
                    }}
                  >
                    Propose revised session
                  </button>
                )}
              </div>
            )}

            {booking.status === 'PENDING_PAYMENT' && (
              <div>
                <p>
                  Both parties have agreed to this session.
                </p>

                {role === 'PARENT' ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void startCheckout(booking.id)
                    }
                  >
                    {busy
                      ? 'Opening secure checkout...'
                      : `Pay ${formatMoney(
                          booking.amountCents
                        )} for session`}
                  </button>
                ) : (
                  <p>
                    Waiting for the parent to pay securely
                    through Stripe.
                  </p>
                )}
              </div>
            )}

            {booking.status === 'PAID' && (
              <div>
                <p>
                  Payment received. Your session is confirmed.
                </p>

                {canComplete && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          'Confirm that this tutoring session has been completed?'
                        )
                      ) {
                        respond(booking.id, 'COMPLETE');
                      }
                    }}
                  >
                    {busy
                      ? 'Updating...'
                      : 'Mark Session Completed'}
                  </button>
                )}
              </div>
            )}

            {booking.status === 'COMPLETED' && (
              <p>
                This tutoring session has been marked completed.
              </p>
            )}

            {booking.status === 'CANCELLED' && (
              <p>
                This session was cancelled before payment.
              </p>
            )}

            {booking.status === 'REFUNDED' && (
              <p>
                This session was cancelled and the refund
                was confirmed by Stripe.
              </p>
            )}

            {canCancel && (
              <div style={{ marginTop: 12 }}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => cancelBooking(booking)}
                >
                  {booking.status === 'PAID'
                    ? 'Cancel session and refund'
                    : 'Cancel session'}
                </button>
              </div>
            )}

            {role === 'PARENT' &&
              booking.status === 'PAID' &&
              beforeSession &&
              !parentCanCancel && (
                <p className="muted">
                  The 24-hour cancellation deadline has
                  passed. Contact support if you need assistance.
                </p>
              )}

            {changingId === booking.id && (
              <div style={{ marginTop: 16 }}>
                <h4>
                  {role === 'TUTOR'
                    ? 'Revise session proposal'
                    : 'Request a different time'}
                </h4>

                {dateFields()}

                {role === 'PARENT' && (
                  <label>
                    <strong>
                      Note for tutor (optional)
                    </strong>
                    <textarea
                      value={note}
                      onChange={(e) =>
                        setNote(e.target.value)
                      }
                      maxLength={1000}
                      rows={3}
                      style={{
                        display: 'block',
                        width: '100%',
                        padding: 10,
                        margin: '8px 0',
                      }}
                    />
                  </label>
                )}

                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    submitChange(booking.id)
                  }
                >
                  {busy ? 'Saving...' : 'Submit new time'}
                </button>{' '}

                <button
                  type="button"
                  disabled={busy}
                  onClick={resetForm}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        );
      })}

      {canPropose && (
        <div style={{ marginTop: 16 }}>
          <h4>Propose another tutoring session</h4>

          <p>
            You can schedule multiple sessions with this parent.
            Choose a different date and time for each session.
          </p>

          {dateFields()}

          <button
            type="button"
            disabled={busy}
            onClick={submitProposal}
          >
            {busy ? 'Submitting...' : 'Propose session'}
          </button>
        </div>
      )}

      <button
        type="button"
        disabled={busy || loading}
        onClick={() => void loadBookings()}
        style={{ marginTop: 12 }}
      >
        Refresh bookings
      </button>

      {notice && (
        <p role="status" style={{ color: '#166534' }}>
          {notice}
        </p>
      )}

      {error && (
        <p role="alert" style={{ color: '#b42318' }}>
          {error}
        </p>
      )}
    </section>
  );
}
