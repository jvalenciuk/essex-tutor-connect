
'use client';

import {
  useCallback,
  useEffect,
  useState,
} from 'react';

type CalendarBooking = {
  id: string;
  inquiryId?: string | null;
  startsAt: string;
  durationMinutes: number;
  amountCents: number;
  status: string;
  parent?: { name: string };
  tutor?: {
    user?: { name: string };
  };
  inquiry?: {
    subject: string;
    grade: string;
  } | null;
};

type AvailabilityResponse = {
  blockedDates: string[];
};

const ZONE = 'America/Toronto';

const weekdays = [
  'Sun', 'Mon', 'Tue', 'Wed',
  'Thu', 'Fri', 'Sat',
];

const statuses: Record<
  string,
  { label: string; color: string }
> = {
  PROPOSED: {
    label: 'Proposed',
    color: '#2563eb',
  },
  CHANGE_REQUESTED: {
    label: 'Change requested',
    color: '#7c3aed',
  },
  PENDING_PAYMENT: {
    label: 'Awaiting payment',
    color: '#d97706',
  },
  PAID: {
    label: 'Confirmed and paid',
    color: '#15803d',
  },
  COMPLETED: {
    label: 'Completed',
    color: '#64748b',
  },
  CANCELLED: {
    label: 'Cancelled',
    color: '#94a3b8',
  },
  REFUNDED: {
    label: 'Refunded',
    color: '#94a3b8',
  },
  DECLINED: {
    label: 'Declined',
    color: '#94a3b8',
  },
};

function localDateKey(
  value: string | Date
) {
  const parts =
    new Intl.DateTimeFormat(
      'en-CA',
      {
        timeZone: ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }
    ).formatToParts(
      new Date(value)
    );

  const get = (type: string) =>
    parts.find(
      part => part.type === type
    )?.value || '';

  return (
    `${get('year')}-` +
    `${get('month')}-` +
    get('day')
  );
}

function formatTime(
  value: string
) {
  return new Date(
    value
  ).toLocaleTimeString(
    'en-CA',
    {
      timeZone: ZONE,
      hour: 'numeric',
      minute: '2-digit',
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

export default function SessionCalendar({
  role,
}: {
  role: string;
}) {
  const [bookings, setBookings] =
    useState<CalendarBooking[]>([]);

  const [blockedDates, setBlockedDates] =
    useState<string[]>([]);

  const [month, setMonth] =
    useState(() => {
      const [year, monthNumber] =
        localDateKey(
          new Date()
        )
          .split('-')
          .map(Number);

      return {
        year,
        monthNumber,
      };
    });

  const [
    selectedDate,
    setSelectedDate,
  ] = useState(() =>
    localDateKey(new Date())
  );

  const [expandedBookingId, setExpandedBookingId] = useState<string | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState('');

  const loadCalendar =
    useCallback(async () => {
      setLoading(true);
      setError('');

      try {
        const bookingResponse =
          await fetch(
            '/api/bookings',
            {
              cache: 'no-store',
            }
          );

        if (!bookingResponse.ok) {
          throw new Error(
            'Unable to load bookings'
          );
        }

        const bookingData =
          await bookingResponse.json();

        const loadedBookings: CalendarBooking[] = Array.isArray(bookingData)
          ? bookingData
          : bookingData.bookings || [];
        setBookings(loadedBookings);

        // Start on the next relevant session instead of an empty today.
        const now = Date.now();
        const nextSession = loadedBookings
          .filter(booking =>
            !['CANCELLED', 'REFUNDED', 'DECLINED', 'COMPLETED'].includes(booking.status) &&
            new Date(booking.startsAt).getTime() >= now
          )
          .sort((a, b) =>
            new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
          )[0];
        if (nextSession) {
          const dateKey = localDateKey(nextSession.startsAt);
          const [year, monthNumber] = dateKey.split('-').map(Number);
          setMonth({ year, monthNumber });
          setSelectedDate(dateKey);
        }

        if (role === 'TUTOR') {
          const availabilityResponse =
            await fetch(
              '/api/tutor/availability',
              {
                cache: 'no-store',
              }
            );

          if (
            availabilityResponse.ok
          ) {
            const availabilityData:
              AvailabilityResponse =
              await availabilityResponse.json();

            setBlockedDates(
              availabilityData.blockedDates ||
                []
            );
          } else {
            setBlockedDates([]);
            setError(
              'Bookings loaded, but blocked dates could not be loaded.'
            );
          }
        } else {
          setBlockedDates([]);
        }
      } catch {
        setError(
          'Unable to load tutoring calendar.'
        );
      } finally {
        setLoading(false);
      }
    }, [role]);

  useEffect(() => {
    void loadCalendar();
  }, [loadCalendar]);

  function changeMonth(
    amount: number
  ) {
    const date = new Date(
      Date.UTC(
        month.year,
        month.monthNumber -
          1 +
          amount,
        1
      )
    );

    const year =
      date.getUTCFullYear();

    const monthNumber =
      date.getUTCMonth() + 1;

    setMonth({
      year,
      monthNumber,
    });

    setSelectedDate(
      `${year}-${String(
        monthNumber
      ).padStart(2, '0')}-01`
    );
  }

  function openBooking(booking: CalendarBooking) {
    if (!booking.inquiryId) return;
    const conversation = document.getElementById('inquiry-' + booking.inquiryId);
    if (!(conversation instanceof HTMLDetailsElement)) return;

    // Open the parent group, the inquiry, and its session panel.
    let ancestor: HTMLElement | null = conversation;
    while (ancestor) {
      if (ancestor instanceof HTMLDetailsElement) ancestor.open = true;
      ancestor = ancestor.parentElement;
    }
    const sessionPanel = conversation.querySelector<HTMLDetailsElement>(
      'details[data-session-panel="true"]'
    );
    if (sessionPanel) sessionPanel.open = true;
    // Target the exact booking card, not merely the matching date or inquiry.
    // A newly opened inquiry can mount its booking manager asynchronously.
    const targetId = 'booking-' + booking.id;
    let attempts = 0;
    const focusExactBooking = () => {
      const card = document.getElementById(targetId);
      if (card && conversation.contains(card)) {
        card.scrollIntoView({ behavior: 'auto', block: 'center' });
        card.focus({ preventScroll: true });
        return;
      }
      if (++attempts < 90) {
        window.setTimeout(focusExactBooking, 100);
      }
    };
    window.dispatchEvent(new CustomEvent('essex:focus-booking', {
      detail: { bookingId: booking.id, inquiryId: booking.inquiryId },
    }));
    window.setTimeout(focusExactBooking, 100);
  }

  const firstWeekday =
    new Date(
      Date.UTC(
        month.year,
        month.monthNumber - 1,
        1
      )
    ).getUTCDay();

  const daysInMonth =
    new Date(
      Date.UTC(
        month.year,
        month.monthNumber,
        0
      )
    ).getUTCDate();

  const monthName =
    new Date(
      Date.UTC(
        month.year,
        month.monthNumber - 1,
        1
      )
    ).toLocaleDateString(
      'en-CA',
      {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      }
    );

  const activeBookings =
    bookings.filter(
      booking =>
        ![
          'CANCELLED',
          'REFUNDED',
          'DECLINED',
        ].includes(
          booking.status
        )
    );

  const sessionsByDay =
    new Map<
      string,
      CalendarBooking[]
    >();

  for (
    const booking of activeBookings
  ) {
    const key = localDateKey(
      booking.startsAt
    );

    const existing =
      sessionsByDay.get(key) || [];

    existing.push(booking);

    sessionsByDay.set(
      key,
      existing
    );
  }

  const blocked =
    new Set(blockedDates);

  const selectedBookings = [
    ...(
      sessionsByDay.get(
        selectedDate
      ) || []
    ),
  ].sort(
    (a, b) =>
      new Date(
        a.startsAt
      ).getTime() -
      new Date(
        b.startsAt
      ).getTime()
  );

  const cells:
    (number | null)[] = [
      ...Array(
        firstWeekday
      ).fill(null),
      ...Array.from(
        {
          length: daysInMonth,
        },
        (_, i) => i + 1
      ),
    ];

  const today =
    localDateKey(
      new Date()
    );

  return (
    <section
      style={{
        border:
          '1px solid #ddd',
        borderRadius: 12,
        padding: 16,
        margin: '20px 0',
      }}
    >
      <h3>
        My tutoring calendar
      </h3>

      <p className="muted">
        Select a date to review
        sessions and their
        statuses. All times
        are Eastern Time.
      </p>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent:
            'space-between',
          gap: 12,
          marginBottom: 16,
        }}
      >
        <button
          type="button"
          onClick={() =>
            changeMonth(-1)
          }
        >
          Previous
        </button>

        <strong>
          {monthName}
        </strong>

        <button
          type="button"
          onClick={() =>
            changeMonth(1)
          }
        >
          Next
        </button>
      </div>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          fontSize: 12,
          marginBottom: 14,
        }}
      >
        {[
          'PAID',
          'PENDING_PAYMENT',
          'PROPOSED',
          'CHANGE_REQUESTED',
          'COMPLETED',
        ].map(status => (
          <span key={status}>
            <span
              style={{
                display:
                  'inline-block',
                width: 9,
                height: 9,
                borderRadius:
                  '50%',
                marginRight: 5,
                background:
                  statuses[
                    status
                  ].color,
              }}
            />

            {
              statuses[
                status
              ].label
            }
          </span>
        ))}

        {role === 'TUTOR' && (
          <span>
            <span
              style={{
                display:
                  'inline-block',
                width: 9,
                height: 9,
                marginRight: 5,
                background:
                  '#dc2626',
              }}
            />
            Blocked date
          </span>
        )}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            'repeat(7, minmax(0, 1fr))',
          gap: 4,
        }}
      >
        {weekdays.map(day => (
          <div
            key={day}
            style={{
              textAlign:
                'center',
              fontWeight: 700,
              fontSize: 12,
              padding:
                '8px 0',
            }}
          >
            {day}
          </div>
        ))}

        {cells.map(
          (day, index) => {
            if (
              day === null
            ) {
              return (
                <div
                  key={`empty-${index}`}
                  aria-hidden="true"
                />
              );
            }

            const dateKey =
              `${month.year}-` +
              `${String(
                month.monthNumber
              ).padStart(
                2,
                '0'
              )}-` +
              `${String(
                day
              ).padStart(
                2,
                '0'
              )}`;

            const sessions =
              sessionsByDay.get(
                dateKey
              ) || [];

            const isBlocked =
              role ===
                'TUTOR' &&
              blocked.has(
                dateKey
              );

            const selected =
              selectedDate ===
              dateKey;

            return (
              <button
                key={dateKey}
                type="button"
                onClick={() =>
                  setSelectedDate(
                    dateKey
                  )
                }
                aria-pressed={
                  selected
                }
                aria-label={
                  `${dateKey}: ` +
                  `${sessions.length} sessions` +
                  (isBlocked
                    ? ', blocked'
                    : '')
                }
                style={{
                  minHeight: 65,
                  border:
                    selected
                      ? '2px solid #087f8c'
                      : '1px solid #ddd',
                  borderRadius: 6,
                  background:
                    isBlocked
                      ? '#fee2e2'
                      : selected
                      ? '#e6f5f5'
                      : 'transparent',
                  color:
                    isBlocked
                      ? '#991b1b'
                      : 'inherit',
                  padding: 4,
                  cursor:
                    'pointer',
                  display:
                    'flex',
                  flexDirection:
                    'column',
                  alignItems:
                    'center',
                  gap: 5,
                }}
              >
                <span
                  style={{
                    fontWeight:
                      dateKey ===
                      today
                        ? 800
                        : 400,
                    textDecoration:
                      dateKey ===
                      today
                        ? 'underline'
                        : 'none',
                  }}
                >
                  {day}
                </span>

                {isBlocked && (
                  <span
                    style={{
                      fontSize: 10,
                    }}
                  >
                    Blocked
                  </span>
                )}

                <span
                  style={{
                    display:
                      'flex',
                    flexWrap:
                      'wrap',
                    justifyContent:
                      'center',
                    gap: 3,
                  }}
                >
                  {sessions
                    .slice(0, 4)
                    .map(
                      session => (
                        <span
                          key={
                            session.id
                          }
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius:
                              '50%',
                            background:
                              statuses[
                                session
                                  .status
                              ]?.color ||
                              '#64748b',
                          }}
                        />
                      )
                    )}
                </span>

                {sessions.length >
                  4 && (
                  <small>
                    +
                    {sessions.length -
                      4}
                  </small>
                )}
              </button>
            );
          }
        )}
      </div>

      <div
        style={{
          marginTop: 20,
          paddingTop: 12,
          borderTop:
            '1px solid #ddd',
        }}
      >
        <h4>
          Sessions for{' '}
          {selectedDate}
        </h4>

        {role ===
          'TUTOR' &&
          blocked.has(
            selectedDate
          ) && (
            <p
              style={{
                color:
                  '#b91c1c',
                fontWeight: 700,
              }}
            >
              This date is
              blocked for new
              tutoring sessions.
            </p>
          )}

        {loading && (
          <p>
            Loading sessions...
          </p>
        )}

        {!loading &&
          selectedBookings.length ===
            0 && (
            <p>
              No sessions
              scheduled for
              this date.
            </p>
          )}

        {!loading &&
          selectedBookings.map(
            booking => {
              const status =
                statuses[
                  booking.status
                ] || {
                  label:
                    booking.status,
                  color:
                    '#64748b',
                };

              return (
                <div
                  key={
                    booking.id
                  }
                  style={{
                    border:
                      '1px solid #ddd',
                    borderLeft:
                      `5px solid ${status.color}`,
                    padding: 12,
                    borderRadius: 6,
                    marginBottom: 10,
                  }}
                >
                  <strong>
                    {formatTime(
                      booking.startsAt
                    )}
                    {' — '}
                    {booking
                      .inquiry
                      ?.subject ||
                      'Tutoring'}
                  </strong>

                  <p>
                    {
                      booking.durationMinutes
                    }{' '}
                    minutes
                    {' · '}
                    {money(
                      booking.amountCents
                    )}
                  </p>

                  <p>
                    {role ===
                    'TUTOR'
                      ? `Parent: ${
                          booking
                            .parent
                            ?.name ||
                          'Parent'
                        }`
                      : `Tutor: ${
                          booking
                            .tutor
                            ?.user
                            ?.name ||
                          'Tutor'
                        }`}
                  </p>

                  <p>
                    <strong>
                      Status:
                    </strong>{' '}
                    <span
                      style={{
                        color:
                          status.color,
                        fontWeight:
                          700,
                      }}
                    >
                      {
                        status.label
                      }
                    </span>
                  </p>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
                    <button
                      type="button"
                      onClick={() => setExpandedBookingId(expandedBookingId === booking.id ? null : booking.id)}
                      aria-expanded={expandedBookingId === booking.id}
                    >
                      {expandedBookingId === booking.id ? 'Hide details' : 'View details'}
                    </button>
                    {booking.inquiryId && (
                      <button type="button" onClick={() => openBooking(booking)}>
                        {role === 'TUTOR' ? 'Manage session / message parent' : 'Manage session / message tutor'}
                      </button>
                    )}
                  </div>
                  {expandedBookingId === booking.id && (
                    <div style={{ marginTop: 12, padding: 12, background: '#f8fafc', borderRadius: 8 }}>
                      <p><strong>Session:</strong> {booking.inquiry?.subject || 'Tutoring'} · {booking.inquiry?.grade || 'Grade not specified'}</p>
                      <p><strong>Start:</strong> {formatTime(booking.startsAt)} Eastern · {booking.durationMinutes} minutes</p>
                      <p><strong>Price:</strong> {money(booking.amountCents)}</p>
                      {booking.status === 'PENDING_PAYMENT' && <p>{role === 'TUTOR' ? 'This time is reserved while the parent completes payment.' : 'Payment is required to confirm this session.'}</p>}
                      {booking.status === 'PROPOSED' && <p>This is a proposal, not a confirmed reservation.</p>}
                    </div>
                  )}
                </div>
              );
            }
          )}
      </div>

      <button
        type="button"
        onClick={() =>
          void loadCalendar()
        }
        disabled={loading}
      >
        {loading
          ? 'Refreshing...'
          : 'Refresh calendar'}
      </button>

      {error && (
        <p
          role="alert"
          style={{
            color:
              '#b42318',
          }}
        >
          {error}
        </p>
      )}
    </section>
  );
}
