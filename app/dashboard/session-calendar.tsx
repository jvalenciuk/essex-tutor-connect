
'use client';

import {
  useCallback,
  useEffect,
  useState,
} from 'react';
import DirectPaymentButton from './direct-payment-button';

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

type BookingContact = { id: string; name: string; subject: string; grade: string };

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
  EXPIRED: {
    label: 'Expired',
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
  bookingContacts = [],
}: {
  role: string;
  bookingContacts?: BookingContact[];
}) {
  const [showBookingForm, setShowBookingForm] = useState(false);
  const [contactId, setContactId] = useState('');
  // A repeat-booking shortcut may select an existing accepted inquiry.
  // Only IDs in bookingContacts are accepted; the API still checks authorization.
  useEffect(() => {
    if (!['PARENT', 'TUTOR'].includes(role) || bookingContacts.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const requested = params.get('bookWith');
    if (!requested || !bookingContacts.some(contact => contact.id === requested)) return;
    setContactId(requested);
    setShowBookingForm(true);
    const calendarSection = document.getElementById('my-calendar');
    if (calendarSection instanceof HTMLDetailsElement) calendarSection.open = true;
  }, [role, bookingContacts.map(contact => contact.id).join('|')]);

  // Scroll only after React has rendered the expanded booking form.
  useEffect(() => {
    if (!showBookingForm || !new URLSearchParams(window.location.search).get('bookWith')) return;
    const calendarSection = document.getElementById('my-calendar');
    if (calendarSection instanceof HTMLDetailsElement) calendarSection.open = true;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById('calendar-booking-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [showBookingForm]);

  const [bookingTime, setBookingTime] = useState('16:00');
  const [bookingDuration, setBookingDuration] = useState('60');
  const [bookingBusy, setBookingBusy] = useState(false);
  const [bookingNotice, setBookingNotice] = useState('');
  const [createdBookingId, setCreatedBookingId] = useState('');
  const [bookingError, setBookingError] = useState('');
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [calendarFeedback, setCalendarFeedback] = useState<Record<string, { kind: 'error' | 'success'; message: string }>>({});

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
    const refreshAfterBookingChange = () => { void loadCalendar(); };
    window.addEventListener('essex:bookings-updated', refreshAfterBookingChange);
    return () => window.removeEventListener('essex:bookings-updated', refreshAfterBookingChange);
  }, [loadCalendar]);


  async function proposeCalendarBooking(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBookingError('');
    setBookingNotice('');
    setCreatedBookingId('');
    if (!contactId) { setBookingError(role === 'PARENT' ? 'Choose a tutor.' : 'Choose a parent.'); return; }
    if (selectedDate < localDateKey(new Date())) {
      setBookingError('This date has already passed. Please choose a future session date.');
      return;
    }
    // Interpret the selected clock time in Windsor/Toronto, regardless of device timezone.
    const [year, monthNumber, day] = selectedDate.split('-').map(Number);
    const [hour, minute] = bookingTime.split(':').map(Number);
    const wallClockUtc = Date.UTC(year, monthNumber - 1, day, hour, minute);
    const offsetParts = new Intl.DateTimeFormat('en-US', {
      timeZone: ZONE, timeZoneName: 'shortOffset', hour: '2-digit',
    }).formatToParts(new Date(wallClockUtc));
    const offsetLabel = offsetParts.find(part => part.type === 'timeZoneName')?.value || 'GMT-5';
    const offsetMatch = offsetLabel.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
    const offsetMinutes = offsetMatch
      ? (offsetMatch[1] === '+' ? 1 : -1) * (Number(offsetMatch[2]) * 60 + Number(offsetMatch[3] || 0))
      : -300;
    const localStart = new Date(wallClockUtc - offsetMinutes * 60000);
    if (!Number.isFinite(localStart.getTime()) || localStart.getTime() <= Date.now()) {
      setBookingError('That start time has already passed. Choose a later time today or select another date.'); return;
    }
    setBookingBusy(true);
    try {
      const response = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inquiryId: contactId, startsAt: localStart.toISOString(), durationMinutes: Number(bookingDuration) }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || result.message || 'Unable to propose session.');
      setCreatedBookingId(typeof result.id === 'string' ? result.id : '');
      setBookingNotice(role === 'PARENT' ? 'Session requested. Your tutor can review and respond.' : 'Session proposed. The parent can now review and accept it.');
      setShowBookingForm(false);
      await loadCalendar();
      window.dispatchEvent(new Event('essex:bookings-updated'));
    } catch (error) {
      setBookingError(error instanceof Error ? error.message : 'Unable to propose session.');
    } finally {
      setBookingBusy(false);
    }
  }

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

  async function acceptCalendarProposal(booking: CalendarBooking) {
    if (acceptingId) return;
    setAcceptingId(booking.id);
    setCalendarFeedback(current => { const next = { ...current }; delete next[booking.id]; return next; });
    try {
      const response = await fetch(`/api/bookings/${encodeURIComponent(booking.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ACCEPT' }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Unable to accept the proposal.');
      await loadCalendar();
      window.dispatchEvent(new Event('essex:bookings-updated'));
      setCalendarFeedback(current => ({ ...current, [booking.id]: { kind: 'success', message: 'Session accepted. Complete payment within 24 hours to confirm your booking.' } }));
    } catch (error) {
      setCalendarFeedback(current => ({ ...current, [booking.id]: { kind: 'error', message: error instanceof Error ? error.message : 'Unable to accept the proposal.' } }));
    } finally {
      setAcceptingId(null);
    }
  }

  function openBooking(booking: CalendarBooking) {
    if (!booking.inquiryId) return;
    const anchor = document.getElementById('inquiry-' + booking.inquiryId);
    const conversation = anchor?.closest<HTMLDetailsElement>('details[data-conversation-group="true"]');
    if (!conversation) return;

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

  // Keep cancelled and refunded sessions in the calendar for booking history.
  // Availability/conflict checks continue to consider only reserving statuses.
  const visibleBookings = bookings.filter(
    booking => booking.status !== 'DECLINED'
  );

  const sessionsByDay =
    new Map<
      string,
      CalendarBooking[]
    >();

  for (
    const booking of visibleBookings
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
          'CANCELLED',
          'REFUNDED',
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
                onClick={() => {
                  setSelectedDate(dateKey);
                  window.requestAnimationFrame(() => {
                    document.getElementById('calendar-selected-day')?.scrollIntoView({
                      behavior: 'smooth',
                      block: 'start',
                    });
                  });
                }}
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
        id="calendar-selected-day"
        tabIndex={-1}
        style={{
          marginTop: 20,
          paddingTop: 12,
          scrollMarginTop: 24,
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

        {(role === 'TUTOR' || role === 'PARENT') && (
          <div style={{ marginBottom: 16 }}>
            <button type="button" onClick={() => { setShowBookingForm(value => !value); setBookingError(''); setBookingNotice(''); }}>
              {showBookingForm ? 'Close booking form' : role === 'PARENT' ? '+ Request a session on this date' : '+ Propose a session on this date'}
            </button>
            {showBookingForm && (
              <form id="calendar-booking-form" onSubmit={proposeCalendarBooking} style={{ marginTop: 12, padding: 14, border: '1px solid #cbd5e1', borderRadius: 8 }}>
                <h3 style={{ marginTop: 0 }}>{role === 'PARENT' ? 'Request a tutoring session' : 'Propose a tutoring session'}</h3>
                {contactId && bookingContacts.some(contact => contact.id === contactId) && (
                  <p role="status" style={{ padding: '10px 12px', background: '#eef5ff', borderRadius: 8 }}>
                    <strong>{role === 'PARENT' ? 'Tutor' : 'Parent'}:</strong> {bookingContacts.find(contact => contact.id === contactId)?.name}
                    {' · '}{bookingContacts.find(contact => contact.id === contactId)?.subject}
                  </p>
                )}
                <label htmlFor="calendar-session-date">Session date</label>
                <input
                  id="calendar-session-date"
                  className="field"
                  type="date"
                  required
                  min={localDateKey(new Date())}
                  value={selectedDate}
                  onChange={event => {
                    const nextDate = event.target.value;
                    if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDate)) return;
                    const [year, monthNumber] = nextDate.split('-').map(Number);
                    setSelectedDate(nextDate);
                    setMonth({ year, monthNumber });
                    setBookingError('');
                  }}
                />
                <p className="muted">{role === 'PARENT' ? 'Choose a tutor from your accepted inquiries. The tutor must accept your request before payment is required.' : 'Choose an existing parent inquiry. The parent must accept the proposal before payment is requested.'}</p>
                <label htmlFor="calendar-parent">{role === 'PARENT' ? 'Tutor and subject' : 'Parent and subject'}</label>
                <select id="calendar-parent" className="field" value={contactId} onChange={event => setContactId(event.target.value)} required>
                  <option value="">{role === 'PARENT' ? 'Select a tutor' : 'Select a parent'}</option>
                  {bookingContacts.map(contact => <option key={contact.id} value={contact.id}>{contact.name} — {contact.subject} ({contact.grade})</option>)}
                </select>
                {bookingContacts.length === 0 && <p className="muted">{role === 'PARENT' ? 'No accepted tutor inquiries yet. Contact a tutor and wait for their acceptance first.' : 'No accepted parent inquiries yet. Accept an inquiry first.'}</p>}
                <label htmlFor="calendar-start">Start time (Eastern Time)</label>
                <select id="calendar-start" className="field" value={bookingTime} onChange={event => { setBookingTime(event.target.value); setBookingError(''); }} required>
                  {Array.from({ length: 61 }, (_, index) => {
                    const totalMinutes = 7 * 60 + index * 15;
                    const hour = Math.floor(totalMinutes / 60);
                    const minute = totalMinutes % 60;
                    const value = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
                    const label = `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
                    const nowInWindsor = new Intl.DateTimeFormat('en-CA', {
                      timeZone: ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
                    }).formatToParts(new Date());
                    const currentHour = Number(nowInWindsor.find(part => part.type === 'hour')?.value || 0);
                    const currentMinute = Number(nowInWindsor.find(part => part.type === 'minute')?.value || 0);
                    const isPastToday = selectedDate === localDateKey(new Date()) && totalMinutes <= currentHour * 60 + currentMinute;
                    return <option key={value} value={value} disabled={isPastToday}>{label}{isPastToday ? ' (passed)' : ''}</option>;
                  })}
                </select>
                <p className="muted" style={{ fontSize: 12, marginTop: -8 }}>Choose a time in 15-minute increments.</p>
                <label htmlFor="calendar-duration">Duration</label>
                <select id="calendar-duration" className="field" value={bookingDuration} onChange={event => { setBookingDuration(event.target.value); setBookingError(''); }}>
                  {[30, 60, 90, 120, 180].map(minutes => <option key={minutes} value={minutes}>{minutes} minutes</option>)}
                </select>
                <div aria-label="Review session details" style={{ margin: '16px 0', padding: 14, border: '1px solid #cbd5e1', borderRadius: 8 }}>
                  <strong>Review before sending</strong>
                  <p style={{ margin: '8px 0 4px' }}><strong>{role === 'PARENT' ? 'Tutor' : 'Parent'}:</strong> {bookingContacts.find(contact => contact.id === contactId)?.name || 'Not selected'}</p>
                  <p style={{ margin: '4px 0' }}><strong>Date:</strong> {selectedDate}</p>
                  <p style={{ margin: '4px 0' }}><strong>Start:</strong> {bookingTime} Eastern Time</p>
                  <p style={{ margin: '4px 0' }}><strong>Duration:</strong> {bookingDuration} minutes</p>
                  <p style={{ margin: '4px 0' }}><strong>Ends:</strong> {(() => {
                    const [hours, minutes] = bookingTime.split(':').map(Number);
                    const total = hours * 60 + minutes + Number(bookingDuration);
                    const endHour = Math.floor(total / 60) % 24;
                    const endMinute = total % 60;
                    return `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}${total >= 1440 ? ' (next day)' : ''}`;
                  })()} Eastern Time</p>
                  <p className="muted" style={{ margin: '8px 0 0' }}>The other person must respond before the session is confirmed.</p>
                </div>
                <button type="submit" disabled={bookingBusy || bookingContacts.length === 0}>{bookingBusy ? 'Submitting...' : role === 'PARENT' ? 'Send session request' : 'Send proposal to parent'}</button>
                {bookingError && <p role="alert" className="error">{bookingError}</p>}
              </form>
            )}
            {bookingNotice && (
              <div role="status" style={{ marginTop: 12, padding: 16, border: '1px solid #86b89b', borderRadius: 8 }}>
                <p style={{ marginTop: 0, fontWeight: 700, color: '#166534' }}>Session {role === 'PARENT' ? 'request' : 'proposal'} sent successfully</p>
                <p>{bookingNotice}</p>
                <p className="muted">This is not yet a confirmed paid session. The recipient needs to respond before the booking can move forward.</p>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <a className="button" href={`/dashboard/bookings?tab=${'waiting'}${createdBookingId ? `&booking=${encodeURIComponent(createdBookingId)}` : ''}`}>Track in My Sessions</a>
                  <button type="button" onClick={() => {
                    setBookingNotice('');
                    setCreatedBookingId('');
                    setBookingError('');
                    // Default repeat sessions to the following week to avoid
                    // accidentally proposing the same date and time twice.
                    const [year, monthNumber, day] = selectedDate.split('-').map(Number);
                    const nextWeek = new Date(Date.UTC(year, monthNumber - 1, day + 7));
                    const nextDate = nextWeek.toISOString().slice(0, 10);
                    setSelectedDate(nextDate);
                    setMonth({ year: nextWeek.getUTCFullYear(), monthNumber: nextWeek.getUTCMonth() + 1 });
                    setShowBookingForm(true);
                    window.requestAnimationFrame(() => document.getElementById('calendar-booking-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
                  }}>Schedule another session</button>
                </div>
              </div>
            )}
          </div>
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

        {!loading && selectedBookings.length > 0 && (
          <details key={selectedDate} open={selectedBookings.length === 1 ? true : undefined}
            style={{ border: selectedBookings.length > 1 ? '1px solid #cbd5e1' : 'none', borderRadius: 8, padding: selectedBookings.length > 1 ? '12px 14px' : 0 }}>
            {selectedBookings.length > 1 && (
              <summary style={{ cursor: 'pointer', fontWeight: 700, marginBottom: 10 }}>
                View {selectedBookings.length} sessions
              </summary>
            )}
            {selectedBookings.map(
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

              const starts = new Date(booking.startsAt).getTime();
              const ends = starts + booking.durationMinutes * 60000;
              const overlappingReservation = selectedBookings.some(other => {
                if (other.id === booking.id ||
                    !['PENDING_PAYMENT', 'PAID'].includes(other.status)) return false;
                const otherStart = new Date(other.startsAt).getTime();
                return starts < otherStart + other.durationMinutes * 60000 && otherStart < ends;
              });
              const tentativeConflict = ['PROPOSED', 'CHANGE_REQUESTED'].includes(booking.status) && overlappingReservation;

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
                  {tentativeConflict && (
                    <p role="status" style={{ color: '#92400e', fontWeight: 700 }}>
                      Conflicts with reserved session
                    </p>
                  )}
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
                    {role === 'PARENT' && booking.status === 'PROPOSED' && (
                      <button type="button" disabled={acceptingId !== null}
                        onClick={() => void acceptCalendarProposal(booking)}>
                        {acceptingId === booking.id ? 'Accepting...' : 'Accept session'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setExpandedBookingId(expandedBookingId === booking.id ? null : booking.id)}
                      aria-expanded={expandedBookingId === booking.id}
                    >
                      {expandedBookingId === booking.id ? 'Hide details' : 'View details'}
                    </button>
                    {booking.inquiryId && !['CANCELLED', 'REFUNDED'].includes(booking.status) && (
                      <button type="button" onClick={() => openBooking(booking)}>
                        {role === 'TUTOR' ? 'Manage session / message parent' : 'Manage session / message tutor'}
                      </button>
                    )}
                  </div>
                  {role === 'PARENT' && booking.status === 'PENDING_PAYMENT' && (
                    <DirectPaymentButton bookingId={booking.id} amount={money(booking.amountCents)} />
                  )}
                  {calendarFeedback[booking.id] && (
                    <p role={calendarFeedback[booking.id].kind === 'error' ? 'alert' : 'status'} style={{ marginTop: 10, padding: '10px 12px', borderRadius: 6, background: calendarFeedback[booking.id].kind === 'error' ? '#fef2f2' : '#f0fdf4', color: calendarFeedback[booking.id].kind === 'error' ? '#b42318' : '#166534' }}>
                      {calendarFeedback[booking.id].message}
                    </p>
                  )}
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
          </details>
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
