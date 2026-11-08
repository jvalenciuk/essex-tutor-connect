
'use client';

import { useEffect, useState } from 'react';

type CalendarBooking = {
  id: string;
  startsAt: string;
  durationMinutes: number;
  amountCents: number;
  status: string;
  parent?: { name: string };
  tutor?: { user?: { name: string } };
  inquiry?: {
    subject: string;
    grade: string;
  } | null;
};

const TIME_ZONE = 'America/Toronto';

const weekdays = [
  'Sun', 'Mon', 'Tue', 'Wed',
  'Thu', 'Fri', 'Sat',
];

function localDateKey(value: string | Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value));

  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value || '';

  return `${get('year')}-${get('month')}-${get('day')}`;
}

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString('en-CA', {
    timeZone: TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
  });
}

function money(cents: number): string {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
  }).format(cents / 100);
}

function statusText(status: string): string {
  const names: Record<string, string> = {
    PROPOSED: 'Proposed',
    CHANGE_REQUESTED: 'Change requested',
    PENDING_PAYMENT: 'Awaiting payment',
    PAID: 'Confirmed and paid',
    COMPLETED: 'Completed',
    CANCELLED: 'Cancelled',
    REFUNDED: 'Refunded',
    DECLINED: 'Declined',
  };

  return names[status] || status;
}

function statusColor(status: string): string {
  if (status === 'PAID') return '#087f5b';
  if (status === 'PENDING_PAYMENT') return '#b7791f';
  if (
    status === 'PROPOSED' ||
    status === 'CHANGE_REQUESTED'
  ) {
    return '#2563eb';
  }
  return '#737373';
}

export default function SessionCalendar({
  role,
}: {
  role: string;
}) {
  const [bookings, setBookings] = useState<
    CalendarBooking[]
  >([]);

  const [month, setMonth] = useState(() => {
    const today = localDateKey(new Date());
    const [year, monthNumber] = today.split('-').map(Number);

    return { year, monthNumber };
  });

  const [selectedDate, setSelectedDate] = useState(
    () => localDateKey(new Date())
  );

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadCalendar() {
    setLoading(true);

    try {
      const response = await fetch('/api/bookings', {
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error('Unable to load calendar');
      }

      const data: CalendarBooking[] =
        await response.json();

      setBookings(data);
      setError('');
    } catch {
      setError('Unable to load sessions.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCalendar();
  }, []);

  function changeMonth(amount: number) {
    const date = new Date(
      Date.UTC(month.year, month.monthNumber - 1 + amount, 1)
    );

    const year = date.getUTCFullYear();
    const monthNumber = date.getUTCMonth() + 1;

    setMonth({ year, monthNumber });
    setSelectedDate(
      `${year}-${String(monthNumber).padStart(2, '0')}-01`
    );
  }

  const firstWeekday = new Date(
    Date.UTC(month.year, month.monthNumber - 1, 1)
  ).getUTCDay();

  const daysInMonth = new Date(
    Date.UTC(month.year, month.monthNumber, 0)
  ).getUTCDate();

  const monthName = new Date(
    Date.UTC(month.year, month.monthNumber - 1, 1)
  ).toLocaleDateString('en-CA', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

  const activeBookings = bookings.filter(
    (booking) =>
      !['CANCELLED', 'REFUNDED', 'DECLINED'].includes(
        booking.status
      )
  );

  const sessionsByDay = new Map<
    string,
    CalendarBooking[]
  >();

  for (const booking of activeBookings) {
    const key = localDateKey(booking.startsAt);
    const existing = sessionsByDay.get(key) || [];
    existing.push(booking);
    sessionsByDay.set(key, existing);
  }

  const selectedBookings = (
    sessionsByDay.get(selectedDate) || []
  ).sort(
    (a, b) =>
      new Date(a.startsAt).getTime() -
      new Date(b.startsAt).getTime()
  );

  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from(
      { length: daysInMonth },
      (_, index) => index + 1
    ),
  ];

  return (
    <section
      style={{
        border: '1px solid #ddd',
        borderRadius: 12,
        padding: 16,
        margin: '20px 0',
        background: '#fff',
      }}
    >
      <h3>My tutoring calendar</h3>

      <p>
        Select a date to see your tutoring sessions.
      </p>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 16,
        }}
      >
        <button
          type="button"
          onClick={() => changeMonth(-1)}
          aria-label="Previous month"
        >
          Previous
        </button>

        <strong>{monthName}</strong>

        <button
          type="button"
          onClick={() => changeMonth(1)}
          aria-label="Next month"
        >
          Next
        </button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
          gap: 4,
        }}
      >
        {weekdays.map((day) => (
          <div
            key={day}
            style={{
              textAlign: 'center',
              fontWeight: 700,
              fontSize: 12,
              padding: '8px 0',
            }}
          >
            {day}
          </div>
        ))}

        {cells.map((day, index) => {
          if (day === null) {
            return (
              <div
                key={`empty-${index}`}
                aria-hidden="true"
              />
            );
          }

          const dateKey =
            `${month.year}-` +
            `${String(month.monthNumber).padStart(2, '0')}-` +
            `${String(day).padStart(2, '0')}`;

          const sessions =
            sessionsByDay.get(dateKey) || [];

          const selected = dateKey === selectedDate;
          const today =
            dateKey === localDateKey(new Date());

          return (
            <button
              key={dateKey}
              type="button"
              onClick={() => setSelectedDate(dateKey)}
              aria-pressed={selected}
              aria-label={
                `${dateKey}: ${sessions.length} sessions`
              }
              style={{
                minHeight: 60,
                border: selected
                  ? '2px solid #087f8c'
                  : '1px solid #ddd',
                borderRadius: 6,
                background: selected
                  ? '#e6f5f5'
                  : '#fff',
                color: '#222',
                padding: 4,
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <span
                style={{
                  fontWeight: today ? 800 : 400,
                  textDecoration: today
                    ? 'underline'
                    : 'none',
                }}
              >
                {day}
              </span>

              {sessions.length > 0 && (
                <span
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    justifyContent: 'center',
                    gap: 3,
                  }}
                >
                  {sessions.slice(0, 3).map((session) => (
                    <span
                      key={session.id}
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: '50%',
                        background: statusColor(
                          session.status
                        ),
                      }}
                    />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          marginTop: 12,
          fontSize: 12,
        }}
      >
        <span>🟢 Paid</span>
        <span>🟡 Awaiting payment</span>
        <span>🔵 Proposed / change requested</span>
      </div>

      <div
        style={{
          marginTop: 20,
          paddingTop: 12,
          borderTop: '1px solid #ddd',
        }}
      >
        <h4>Sessions for {selectedDate}</h4>

        {loading && <p>Loading sessions...</p>}

        {!loading &&
          selectedBookings.length === 0 && (
            <p>No sessions scheduled for this date.</p>
          )}

        {!loading &&
          selectedBookings.map((booking) => (
            <div
              key={booking.id}
              style={{
                border: '1px solid #ddd',
                borderLeft:
                  `4px solid ${statusColor(booking.status)}`,
                padding: 12,
                borderRadius: 6,
                marginBottom: 10,
              }}
            >
              <strong>
                {formatTime(booking.startsAt)}
                {' — '}
                {booking.inquiry?.subject || 'Tutoring'}
              </strong>

              <p>
                {booking.durationMinutes} minutes
                {' · '}
                {money(booking.amountCents)}
              </p>

              <p>
                {role === 'TUTOR'
                  ? `Parent: ${booking.parent?.name || 'Parent'}`
                  : `Tutor: ${booking.tutor?.user?.name || 'Tutor'}`}
              </p>

              <p>
                <strong>Status:</strong>{' '}
                {statusText(booking.status)}
              </p>
            </div>
          ))}
      </div>

      <button
        type="button"
        onClick={() => void loadCalendar()}
        disabled={loading}
      >
        Refresh calendar
      </button>

      {error && (
        <p role="alert" style={{ color: '#b42318' }}>
          {error}
        </p>
      )}
    </section>
  );
}
