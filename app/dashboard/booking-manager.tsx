
'use client';

import {
  useCallback,
  useEffect,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';

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

const DAY_MS = 86400000;

const statusInfo: Record<
  string,
  { label: string; color: string }
> = {
  PROPOSED: {
    label: 'Session proposed',
    color: '#2563eb',
  },
  CHANGE_REQUESTED: {
    label: 'Time change requested',
    color: '#7c3aed',
  },
  PENDING_PAYMENT: {
    label: 'Awaiting payment',
    color: '#b45309',
  },
  PAID: {
    label: 'Confirmed and paid',
    color: '#15803d',
  },
  COMPLETED: {
    label: 'Completed',
    color: '#475569',
  },
  DECLINED: {
    label: 'Declined',
    color: '#64748b',
  },
  CANCELLED: {
    label: 'Cancelled',
    color: '#64748b',
  },
  REFUNDED: {
    label: 'Refunded',
    color: '#64748b',
  },
};

function formatDate(value: string) {
  return new Date(value).toLocaleString(
    'en-CA',
    {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: 'America/Toronto',
    }
  );
}

function money(cents: number) {
  return new Intl.NumberFormat(
    'en-CA',
    {
      style: 'currency',
      currency: 'CAD',
    }
  ).format(cents / 100);
}

function nextStep(
  status: string,
  role: string
) {
  switch (status) {
    case 'PROPOSED':
      return role === 'PARENT'
        ? 'Review the proposed session. Accept it, request a different time, or decline.'
        : 'Waiting for the parent to respond to your proposal.';
    case 'CHANGE_REQUESTED':
      return role === 'TUTOR'
        ? 'Accept the parent’s requested time or propose an alternative.'
        : 'Waiting for the tutor to accept your requested time or propose an alternative.';
    case 'PENDING_PAYMENT':
      return role === 'PARENT'
        ? 'Your session time has been agreed upon. Complete secure payment to confirm it.'
        : 'Waiting for the parent to complete payment.';
    case 'PAID':
      return 'Your session is confirmed. Check the date and time below.';
    case 'COMPLETED':
      return 'This session has been marked completed.';
    case 'CANCELLED':
      return 'This session was cancelled before payment.';
    case 'REFUNDED':
      return 'This session was cancelled and the Stripe refund was confirmed.';
    case 'DECLINED':
      return 'This proposal was declined. The tutor can propose another session.';
    default:
      return '';
  }
}

export default function BookingManager({
  inquiryId,
  role,
}: Props) {
  const router = useRouter();
  const [bookings, setBookings] =
    useState<Booking[]>([]);
  const [loading, setLoading] =
    useState(true);
  const [busy, setBusy] =
    useState(false);
  const [error, setError] =
    useState('');
  const [notice, setNotice] =
    useState('');
  const [startsAt, setStartsAt] =
    useState('');
  const [duration, setDuration] =
    useState('60');
  const [note, setNote] =
    useState('');
  const [changingId, setChangingId] =
    useState<string | null>(null);

  const loadBookings = useCallback(
    async () => {
      try {
        const response = await fetch(
          '/api/bookings',
          { cache: 'no-store' }
        );

        if (!response.ok) {
          throw new Error(
            'Unable to load bookings'
          );
        }

        const data: Booking[] =
          await response.json();

        setBookings(
          data.filter(
            item =>
              item.inquiryId === inquiryId
          )
        );
        setError('');
      } catch {
        setError(
          'Unable to load bookings.'
        );
      } finally {
        setLoading(false);
      }
    },
    [inquiryId]
  );

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
    successMessage =
      'Booking updated successfully.'
  ) {
    setBusy(true);
    setError('');
    setNotice('');

    try {
      const response = await fetch(
        url,
        {
          method,
          headers: {
            'Content-Type':
              'application/json',
          },
          body: JSON.stringify(
            payload
          ),
        }
      );

      const result =
        await response.json().catch(
          () => null
        );

      if (!response.ok) {
        throw new Error(
          result?.error ||
            'Unable to update booking'
        );
      }

      resetForm();
      await loadBookings();
      router.refresh();
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

  async function startCheckout(
    bookingId: string
  ) {
    setBusy(true);
    setError('');
    setNotice('');

    try {
      const response = await fetch(
        '/api/checkout',
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json',
          },
          body: JSON.stringify({
            bookingId,
          }),
        }
      );

      const result =
        await response.json().catch(
          () => null
        );

      if (!response.ok) {
        throw new Error(
          result?.error ||
            'Unable to start payment.'
        );
      }

      if (
        typeof result?.url !==
          'string' ||
        !result.url.startsWith(
          'https://checkout.stripe.com/'
        )
      ) {
        throw new Error(
          'The payment link was not valid.'
        );
      }

      window.location.assign(
        result.url
      );
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
      setError(
        'Please choose a date and time.'
      );
      return null;
    }

    const date =
      new Date(startsAt);
    const minutes =
      Number(duration);

    if (
      Number.isNaN(
        date.getTime()
      ) ||
      date.getTime() <= Date.now()
    ) {
      setError(
        'Please choose a future date and time.'
      );
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
      startsAt:
        date.toISOString(),
      durationMinutes:
        minutes,
    };
  }

  function submitProposal() {
    const details =
      datePayload();

    if (!details) return;

    void sendRequest(
      '/api/bookings',
      'POST',
      {
        inquiryId,
        ...details,
      },
      role === 'PARENT'
        ? 'Session request sent to the tutor.'
        : 'New session proposed successfully.'
    );
  }

  function submitChange(
    bookingId: string
  ) {
    const details =
      datePayload();

    if (!details) return;

    void sendRequest(
      `/api/bookings/${encodeURIComponent(
        bookingId
      )}`,
      'PATCH',
      {
        action:
          role === 'TUTOR'
            ? 'REVISE'
            : 'REQUEST_CHANGE',
        ...details,
        ...(role === 'PARENT'
          ? { note }
          : {}),
      }
    );
  }

  function respond(
    bookingId: string,
    action:
      | 'ACCEPT'
      | 'DECLINE'
      | 'COMPLETE'
  ) {
    void sendRequest(
      `/api/bookings/${encodeURIComponent(
        bookingId
      )}`,
      'PATCH',
      { action }
    );
  }

  function cancelBooking(
    booking: Booking
  ) {
    const isPaid =
      booking.status === 'PAID';

    const message = isPaid
      ? 'Cancel this tutoring session and request a full refund through Stripe?'
      : 'Cancel this tutoring session proposal?';

    if (
      !window.confirm(message)
    ) {
      return;
    }

    void sendRequest(
      `/api/bookings/${encodeURIComponent(
        booking.id
      )}`,
      'PATCH',
      { action: 'CANCEL' },
      isPaid
        ? 'Cancellation processed. Stripe refund confirmed.'
        : 'Booking cancelled successfully.'
    );
  }

  function dateFields() {
    return (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',
          gap: 14,
          marginTop: 12,
        }}
      >
        <label>
          <strong>
            Date and time
          </strong>
          <input
            className="field"
            type="datetime-local"
            value={startsAt}
            onChange={e =>
              setStartsAt(
                e.target.value
              )
            }
            required
          />
        </label>

        <label>
          <strong>
            Session duration
          </strong>
          <select
            className="field"
            value={duration}
            onChange={e =>
              setDuration(
                e.target.value
              )
            }
          >
            <option value="30">
              30 minutes
            </option>
            <option value="60">
              60 minutes
            </option>
            <option value="90">
              90 minutes
            </option>
            <option value="120">
              120 minutes
            </option>
            <option value="180">
              180 minutes
            </option>
          </select>
        </label>
      </div>
    );
  }

  const sortedBookings = [
    ...bookings,
  ].sort(
    (a, b) =>
      new Date(
        b.startsAt
      ).getTime() -
      new Date(
        a.startsAt
      ).getTime()
  );

  const activeBookings = sortedBookings.filter(booking =>
    !['REFUNDED', 'CANCELLED', 'DECLINED', 'COMPLETED'].includes(booking.status)
  ).sort((a, b) => {
    const priority = (status: string) => {
      if (status === 'CHANGE_REQUESTED') return 0;
      if (status === 'PROPOSED') return 1;
      if (status === 'PENDING_PAYMENT') return 2;
      if (status === 'PAID') return 3;
      return 4;
    };
    const aPriority = priority(a.status);
    const bPriority = priority(b.status);
    return aPriority - bPriority || new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
  });
  const pastBookings = sortedBookings.filter(booking =>
    ['REFUNDED', 'CANCELLED', 'DECLINED', 'COMPLETED'].includes(booking.status)
  );

  return (
    <section
      style={{
        marginTop: 20,
        paddingTop: 16,
        borderTop:
          '1px solid #ddd',
        minWidth: 0,
      }}
    >
      <h3>
        Tutoring sessions
      </h3>

      <p className="muted">
        Manage session proposals,
        scheduling, and secure
        payments here.
      </p>

      {loading && (
        <p>
          Loading bookings...
        </p>
      )}

      {!loading &&
        sortedBookings.length ===
          0 && (
          <p>
            No session proposals yet.
          </p>
        )}

      <h4 style={{ marginTop: 20, marginBottom: 12 }}>Current sessions ({activeBookings.length}) · Requests first</h4>
      {activeBookings.length === 0 && !loading && <p className="muted">No active session requests.</p>}
      {activeBookings.map(
        booking => {
          const startTime =
            new Date(
              booking.startsAt
            ).getTime();

          const sessionEndsAt =
            startTime +
            booking.durationMinutes *
              60 *
              1000;

          const beforeSession =
            startTime >
            Date.now();

          const canComplete =
            role ===
              'TUTOR' &&
            booking.status ===
              'PAID' &&
            sessionEndsAt <=
              Date.now();

          const parentCanCancel =
            role ===
              'PARENT' &&
            startTime -
              Date.now() >=
              DAY_MS;

          const tutorCanCancel =
            role ===
              'TUTOR' &&
            beforeSession;

          const canCancel =
            (parentCanCancel ||
              tutorCanCancel) &&
            [
              'PROPOSED',
              'CHANGE_REQUESTED',
              'PAID',
            ].includes(
              booking.status
            );

          const info =
            statusInfo[
              booking.status
            ] || {
              label:
                booking.status,
              color:
                '#64748b',
            };

          return (
            <article
              key={
                booking.id
              }
              className="card"
              style={{
                marginBottom: 16,
                minWidth: 0,
                overflowWrap:
                  'anywhere',
                borderLeft:
                  `5px solid ${info.color}`,
              }}
            >
              <div
                style={{
                  display:
                    'flex',
                  justifyContent:
                    'space-between',
                  alignItems:
                    'flex-start',
                  flexWrap:
                    'wrap',
                  gap: 12,
                }}
              >
                <h4>
                  {formatDate(
                    booking.startsAt
                  )}
                </h4>

                <span
                  style={{
                    color:
                      info.color,
                    fontWeight:
                      700,
                  }}
                >
                  {info.label}
                </span>
              </div>

              <p>
                <strong>
                  Next step:
                </strong>{' '}
                {nextStep(
                  booking.status,
                  role
                )}
              </p>

              <p>
                <strong>
                  Duration:
                </strong>{' '}
                {
                  booking.durationMinutes
                }{' '}
                minutes
              </p>

              <p>
                <strong>
                  Session price:
                </strong>{' '}
                {money(
                  booking.amountCents
                )}
              </p>

              {role ===
                'TUTOR' && (
                <>
                  <p>
                    <strong>
                      Platform
                      commission (15%):
                    </strong>{' '}
                    {money(
                      booking.platformFeeCents
                    )}
                  </p>

                  <p>
                    <strong>
                      Tutor portion
                      before processing
                      fees:
                    </strong>{' '}
                    {money(
                      booking.amountCents -
                        booking.platformFeeCents
                    )}
                  </p>
                </>
              )}

              {booking.status ===
                'PROPOSED' &&
                role ===
                  'PARENT' && (
                  <div
                    style={{
                      display:
                        'flex',
                      flexWrap:
                        'wrap',
                      gap: 8,
                    }}
                  >
                    <button
                      type="button"
                      disabled={
                        busy
                      }
                      onClick={() =>
                        respond(
                          booking.id,
                          'ACCEPT'
                        )
                      }
                    >
                      Accept
                      session
                    </button>

                    <button
                      type="button"
                      disabled={
                        busy
                      }
                      onClick={() => {
                        setChangingId(
                          booking.id
                        );
                        setStartsAt(
                          ''
                        );
                        setDuration(
                          String(
                            booking.durationMinutes
                          )
                        );
                        setError(
                          ''
                        );
                      }}
                    >
                      Request
                      different
                      time
                    </button>

                    <button
                      type="button"
                      disabled={
                        busy
                      }
                      onClick={() =>
                        respond(
                          booking.id,
                          'DECLINE'
                        )
                      }
                    >
                      Decline
                    </button>
                  </div>
                )}

              {booking.status ===
                'CHANGE_REQUESTED' && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
                  <p>
                    <strong>
                      Requested
                      time:
                    </strong>{' '}
                    {booking.requestedStartsAt
                      ? formatDate(
                          booking.requestedStartsAt
                        )
                      : 'Not provided'}
                  </p>

                  <p>
                    <strong>
                      Requested
                      duration:
                    </strong>{' '}
                    {
                      booking.requestedDurationMinutes
                    }{' '}
                    minutes
                  </p>

                  {booking.requestNote && (
                    <p>
                      <strong>
                        Parent note:
                      </strong>{' '}
                      {
                        booking.requestNote
                      }
                    </p>
                  )}

                  {role === 'TUTOR' &&
                    booking.requestedStartsAt &&
                    booking.requestedDurationMinutes && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        if (window.confirm('Accept the requested session time? The parent will then be able to pay.')) {
                          void sendRequest(
                            `/api/bookings/${encodeURIComponent(booking.id)}`,
                            'PATCH',
                            { action: 'ACCEPT_REQUESTED_TIME' },
                            'Requested time accepted. The parent can now pay.'
                          );
                        }
                      }}
                    >
                      Accept requested time
                    </button>
                  )}

                  {role ===
                    'TUTOR' && (
                    <button
                      type="button"
                      disabled={
                        busy
                      }
                      onClick={() => {
                        setChangingId(
                          booking.id
                        );
                        setStartsAt(
                          ''
                        );
                        setDuration(
                          String(
                            booking.requestedDurationMinutes ||
                              booking.durationMinutes
                          )
                        );
                      }}
                    >
                      Propose
                      revised
                      session
                    </button>
                  )}
                </div>
              )}

              {booking.status ===
                'PENDING_PAYMENT' && (
                <div>
                  {role ===
                  'PARENT' ? (
                    <button
                      type="button"
                      disabled={
                        busy
                      }
                      onClick={() =>
                        void startCheckout(
                          booking.id
                        )
                      }
                    >
                      {busy
                        ? 'Opening checkout...'
                        : `Pay ${money(
                            booking.amountCents
                          )} securely`}
                    </button>
                  ) : (
                    <p>
                      Waiting
                      for parent
                      payment.
                    </p>
                  )}
                </div>
              )}

              {booking.status ===
                'PAID' && (
                <div>
                  <p>
                    Payment received.
                    Your session
                    is confirmed.
                  </p>

                  {canComplete && (
                    <button
                      type="button"
                      disabled={
                        busy
                      }
                      onClick={() => {
                        if (
                          window.confirm(
                            'Confirm this session has been completed?'
                          )
                        ) {
                          respond(
                            booking.id,
                            'COMPLETE'
                          );
                        }
                      }}
                    >
                      Mark session
                      completed
                    </button>
                  )}
                </div>
              )}

              {canCancel && (
                <div
                  style={{
                    marginTop: 12,
                  }}
                >
                  <button
                    type="button"
                    disabled={
                      busy
                    }
                    onClick={() =>
                      cancelBooking(
                        booking
                      )
                    }
                  >
                    {booking.status ===
                    'PAID'
                      ? 'Cancel and refund'
                      : 'Cancel session'}
                  </button>
                </div>
              )}

              {role ===
                'PARENT' &&
                booking.status ===
                  'PAID' &&
                beforeSession &&
                !parentCanCancel && (
                  <p className="muted">
                    The 24-hour
                    cancellation
                    deadline has
                    passed. Contact
                    support for
                    assistance.
                  </p>
                )}

              {changingId ===
                booking.id && (
                <div
                  style={{
                    marginTop: 16,
                    paddingTop: 12,
                    borderTop:
                      '1px solid #ddd',
                  }}
                >
                  <h4>
                    {role ===
                    'TUTOR'
                      ? 'Revise session'
                      : 'Request a different time'}
                  </h4>

                  {dateFields()}

                  {role ===
                    'PARENT' && (
                    <label>
                      Note for tutor
                      (optional)
                      <textarea
                        className="field"
                        rows={3}
                        maxLength={
                          1000
                        }
                        value={
                          note
                        }
                        onChange={
                          e =>
                            setNote(
                              e.target.value
                            )
                        }
                      />
                    </label>
                  )}

                  <div
                    style={{
                      display:
                        'flex',
                      flexWrap:
                        'wrap',
                      gap: 8,
                      marginTop: 12,
                    }}
                  >
                    <button
                      type="button"
                      disabled={
                        busy
                      }
                      onClick={() =>
                        submitChange(
                          booking.id
                        )
                      }
                    >
                      Submit
                      new time
                    </button>

                    <button
                      type="button"
                      disabled={
                        busy
                      }
                      onClick={
                        resetForm
                      }
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </article>
          );
        }
      )}

      {pastBookings.length > 0 && (
        <details style={{ marginTop: 20 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 700, padding: '12px 0' }}>
            Past and cancelled sessions ({pastBookings.length})
          </summary>
      {pastBookings.map(
        booking => {
          const startTime =
            new Date(
              booking.startsAt
            ).getTime();

          const sessionEndsAt =
            startTime +
            booking.durationMinutes *
              60 *
              1000;

          const beforeSession =
            startTime >
            Date.now();

          const canComplete =
            role ===
              'TUTOR' &&
            booking.status ===
              'PAID' &&
            sessionEndsAt <=
              Date.now();

          const parentCanCancel =
            role ===
              'PARENT' &&
            startTime -
              Date.now() >=
              DAY_MS;

          const tutorCanCancel =
            role ===
              'TUTOR' &&
            beforeSession;

          const canCancel =
            (parentCanCancel ||
              tutorCanCancel) &&
            [
              'PROPOSED',
              'CHANGE_REQUESTED',
              'PAID',
            ].includes(
              booking.status
            );

          const info =
            statusInfo[
              booking.status
            ] || {
              label:
                booking.status,
              color:
                '#64748b',
            };

          return (
            <article
              key={
                booking.id
              }
              className="card"
              style={{
                marginBottom: 16,
                minWidth: 0,
                overflowWrap:
                  'anywhere',
                borderLeft:
                  `5px solid ${info.color}`,
              }}
            >
              <div
                style={{
                  display:
                    'flex',
                  justifyContent:
                    'space-between',
                  alignItems:
                    'flex-start',
                  flexWrap:
                    'wrap',
                  gap: 12,
                }}
              >
                <h4>
                  {formatDate(
                    booking.startsAt
                  )}
                </h4>

                <span
                  style={{
                    color:
                      info.color,
                    fontWeight:
                      700,
                  }}
                >
                  {info.label}
                </span>
              </div>

              <p>
                <strong>
                  Next step:
                </strong>{' '}
                {nextStep(
                  booking.status,
                  role
                )}
              </p>

              <p>
                <strong>
                  Duration:
                </strong>{' '}
                {
                  booking.durationMinutes
                }{' '}
                minutes
              </p>

              <p>
                <strong>
                  Session price:
                </strong>{' '}
                {money(
                  booking.amountCents
                )}
              </p>

              {role ===
                'TUTOR' && (
                <>
                  <p>
                    <strong>
                      Platform
                      commission (15%):
                    </strong>{' '}
                    {money(
                      booking.platformFeeCents
                    )}
                  </p>

                  <p>
                    <strong>
                      Tutor portion
                      before processing
                      fees:
                    </strong>{' '}
                    {money(
                      booking.amountCents -
                        booking.platformFeeCents
                    )}
                  </p>
                </>
              )}

              {booking.status ===
                'PROPOSED' &&
                role ===
                  'PARENT' && (
                  <div
                    style={{
                      display:
                        'flex',
                      flexWrap:
                        'wrap',
                      gap: 8,
                    }}
                  >
                    <button
                      type="button"
                      disabled={
                        busy
                      }
                      onClick={() =>
                        respond(
                          booking.id,
                          'ACCEPT'
                        )
                      }
                    >
                      Accept
                      session
                    </button>

                    <button
                      type="button"
                      disabled={
                        busy
                      }
                      onClick={() => {
                        setChangingId(
                          booking.id
                        );
                        setStartsAt(
                          ''
                        );
                        setDuration(
                          String(
                            booking.durationMinutes
                          )
                        );
                        setError(
                          ''
                        );
                      }}
                    >
                      Request
                      different
                      time
                    </button>

                    <button
                      type="button"
                      disabled={
                        busy
                      }
                      onClick={() =>
                        respond(
                          booking.id,
                          'DECLINE'
                        )
                      }
                    >
                      Decline
                    </button>
                  </div>
                )}

              {booking.status ===
                'CHANGE_REQUESTED' && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
                  <p>
                    <strong>
                      Requested
                      time:
                    </strong>{' '}
                    {booking.requestedStartsAt
                      ? formatDate(
                          booking.requestedStartsAt
                        )
                      : 'Not provided'}
                  </p>

                  <p>
                    <strong>
                      Requested
                      duration:
                    </strong>{' '}
                    {
                      booking.requestedDurationMinutes
                    }{' '}
                    minutes
                  </p>

                  {booking.requestNote && (
                    <p>
                      <strong>
                        Parent note:
                      </strong>{' '}
                      {
                        booking.requestNote
                      }
                    </p>
                  )}

                  {role === 'TUTOR' &&
                    booking.requestedStartsAt &&
                    booking.requestedDurationMinutes && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        if (window.confirm('Accept the requested session time? The parent will then be able to pay.')) {
                          void sendRequest(
                            `/api/bookings/${encodeURIComponent(booking.id)}`,
                            'PATCH',
                            { action: 'ACCEPT_REQUESTED_TIME' },
                            'Requested time accepted. The parent can now pay.'
                          );
                        }
                      }}
                    >
                      Accept requested time
                    </button>
                  )}

                  {role ===
                    'TUTOR' && (
                    <button
                      type="button"
                      disabled={
                        busy
                      }
                      onClick={() => {
                        setChangingId(
                          booking.id
                        );
                        setStartsAt(
                          ''
                        );
                        setDuration(
                          String(
                            booking.requestedDurationMinutes ||
                              booking.durationMinutes
                          )
                        );
                      }}
                    >
                      Propose
                      revised
                      session
                    </button>
                  )}
                </div>
              )}

              {booking.status ===
                'PENDING_PAYMENT' && (
                <div>
                  {role ===
                  'PARENT' ? (
                    <button
                      type="button"
                      disabled={
                        busy
                      }
                      onClick={() =>
                        void startCheckout(
                          booking.id
                        )
                      }
                    >
                      {busy
                        ? 'Opening checkout...'
                        : `Pay ${money(
                            booking.amountCents
                          )} securely`}
                    </button>
                  ) : (
                    <p>
                      Waiting
                      for parent
                      payment.
                    </p>
                  )}
                </div>
              )}

              {booking.status ===
                'PAID' && (
                <div>
                  <p>
                    Payment received.
                    Your session
                    is confirmed.
                  </p>

                  {canComplete && (
                    <button
                      type="button"
                      disabled={
                        busy
                      }
                      onClick={() => {
                        if (
                          window.confirm(
                            'Confirm this session has been completed?'
                          )
                        ) {
                          respond(
                            booking.id,
                            'COMPLETE'
                          );
                        }
                      }}
                    >
                      Mark session
                      completed
                    </button>
                  )}
                </div>
              )}

              {canCancel && (
                <div
                  style={{
                    marginTop: 12,
                  }}
                >
                  <button
                    type="button"
                    disabled={
                      busy
                    }
                    onClick={() =>
                      cancelBooking(
                        booking
                      )
                    }
                  >
                    {booking.status ===
                    'PAID'
                      ? 'Cancel and refund'
                      : 'Cancel session'}
                  </button>
                </div>
              )}

              {role ===
                'PARENT' &&
                booking.status ===
                  'PAID' &&
                beforeSession &&
                !parentCanCancel && (
                  <p className="muted">
                    The 24-hour
                    cancellation
                    deadline has
                    passed. Contact
                    support for
                    assistance.
                  </p>
                )}

              {changingId ===
                booking.id && (
                <div
                  style={{
                    marginTop: 16,
                    paddingTop: 12,
                    borderTop:
                      '1px solid #ddd',
                  }}
                >
                  <h4>
                    {role ===
                    'TUTOR'
                      ? 'Revise session'
                      : 'Request a different time'}
                  </h4>

                  {dateFields()}

                  {role ===
                    'PARENT' && (
                    <label>
                      Note for tutor
                      (optional)
                      <textarea
                        className="field"
                        rows={3}
                        maxLength={
                          1000
                        }
                        value={
                          note
                        }
                        onChange={
                          e =>
                            setNote(
                              e.target.value
                            )
                        }
                      />
                    </label>
                  )}

                  <div
                    style={{
                      display:
                        'flex',
                      flexWrap:
                        'wrap',
                      gap: 8,
                      marginTop: 12,
                    }}
                  >
                    <button
                      type="button"
                      disabled={
                        busy
                      }
                      onClick={() =>
                        submitChange(
                          booking.id
                        )
                      }
                    >
                      Submit
                      new time
                    </button>

                    <button
                      type="button"
                      disabled={
                        busy
                      }
                      onClick={
                        resetForm
                      }
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </article>
          );
        }
      )}

        </details>
      )}

      {(role === 'TUTOR' || role === 'PARENT') &&
        !loading && (
          <div
            className="card"
            style={{
              marginTop: 16,
            }}
          >
            <h3>
              {role === 'PARENT' ? 'Request a tutoring session' : 'Propose another tutoring session'}
            </h3>

            <p className="muted">
              {role === 'PARENT'
                ? 'Choose a preferred date and time. Your tutor can accept it or suggest an alternative. No payment is required until the tutor accepts.'
                : 'You can schedule multiple sessions with the same parent. Choose a date and time within your availability.'}
            </p>

            {dateFields()}

            <button
              type="button"
              disabled={
                busy
              }
              onClick={
                submitProposal
              }
            >
              {busy
                ? 'Submitting...'
                : role === 'PARENT' ? 'Request session' : 'Propose session'}
            </button>
          </div>
        )}

      <button
        type="button"
        disabled={
          busy || loading
        }
        onClick={() =>
          void loadBookings()
        }
        style={{
          marginTop: 12,
        }}
      >
        Refresh bookings
      </button>

      {notice && (
        <p
          role="status"
          style={{
            color: '#166534',
          }}
        >
          {notice}
        </p>
      )}

      {error && (
        <p
          role="alert"
          style={{
            color: '#b42318',
          }}
        >
          {error}
        </p>
      )}
    </section>
  );
}
