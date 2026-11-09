
'use client';

import { useEffect, useState } from 'react';

type WeeklySlot = {
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
};

type BusySlot = {
  startsAt: string;
  durationMinutes: number;
};

type AvailabilityData = {
  weekly: WeeklySlot[];
  blockedDates: string[];
  busy: BusySlot[];
  timeZone: string;
};

const ZONE = 'America/Toronto';
const MINUTE = 60 * 1000;

const days = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

function localParts(date: Date) {
  const parts = new Intl.DateTimeFormat(
    'en-US',
    {
      timeZone: ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }
  ).formatToParts(date);

  const get = (type: string) =>
    parts.find(p => p.type === type)?.value ||
    '';

  const dayOfWeek = [
    'Sun', 'Mon', 'Tue', 'Wed',
    'Thu', 'Fri', 'Sat',
  ].indexOf(get('weekday'));

  return {
    dateKey:
      `${get('year')}-${get('month')}-${get('day')}`,
    dayOfWeek,
    minute:
      Number(get('hour')) * 60 +
      Number(get('minute')),
  };
}

function clock(value: number) {
  const hour = Math.floor(value / 60);
  const minute = value % 60;

  return new Date(
    Date.UTC(2020, 0, 1, hour, minute)
  ).toLocaleTimeString('en-CA', {
    timeZone: 'UTC',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function suggestedSlots(
  data: AvailabilityData
): Date[] {
  const result: Date[] = [];
  const blocked = new Set(
    data.blockedDates
  );

  const now = Date.now();
  const end = now + 14 * 24 * 60 * MINUTE;

  const busy = data.busy.map(slot => {
    const start = new Date(
      slot.startsAt
    ).getTime();

    return {
      start,
      end:
        start +
        slot.durationMinutes * MINUTE,
    };
  });

  // Start on the next half-hour boundary.
  const first =
    Math.ceil(
      (now + 60 * MINUTE) /
        (30 * MINUTE)
    ) *
    (30 * MINUTE);

  for (
    let time = first;
    time < end && result.length < 8;
    time += 30 * MINUTE
  ) {
    const start = new Date(time);
    const finish = new Date(
      time + 60 * MINUTE
    );

    const a = localParts(start);
    const b = localParts(
      new Date(finish.getTime() - 1)
    );
    const c = localParts(finish);

    if (
      blocked.has(a.dateKey) ||
      a.dateKey !== b.dateKey ||
      a.dateKey !== c.dateKey
    ) {
      continue;
    }

    const inHours = data.weekly.some(
      slot =>
        slot.dayOfWeek === a.dayOfWeek &&
        a.minute >= slot.startMinute &&
        c.minute <= slot.endMinute
    );

    if (!inHours) {
      continue;
    }

    const overlaps = busy.some(
      slot =>
        time < slot.end &&
        slot.start <
          time + 60 * MINUTE
    );

    if (!overlaps) {
      result.push(start);
    }
  }

  return result;
}

function formatSuggestion(date: Date) {
  return date.toLocaleString('en-CA', {
    timeZone: ZONE,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function TutorAvailability({
  tutorId,
}: {
  tutorId: string;
}) {
  const [data, setData] =
    useState<AvailabilityData | null>(
      null
    );

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState('');

  useEffect(() => {
    let active = true;

    fetch(
      `/api/tutors/${encodeURIComponent(
        tutorId
      )}/availability`,
      { cache: 'no-store' }
    )
      .then(async response => {
        if (!response.ok) {
          throw new Error(
            'Availability unavailable'
          );
        }

        return response.json();
      })
      .then(
        (result: AvailabilityData) => {
          if (active) {
            setData(result);
          }
        }
      )
      .catch(() => {
        if (active) {
          setError(
            'Contact this tutor to discuss scheduling.'
          );
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [tutorId]);

  if (loading) {
    return (
      <p className="muted">
        Loading availability...
      </p>
    );
  }

  if (error || !data) {
    return (
      <p className="muted">
        {error ||
          'Availability unavailable.'}
      </p>
    );
  }

  if (!data.weekly.length) {
    return (
      <p className="muted">
        Availability not yet published.
        Contact this tutor to arrange
        a suitable time.
      </p>
    );
  }

  const slots = suggestedSlots(data);

  return (
    <section
      style={{
        margin: '16px 0',
        padding: 14,
        border: '1px solid #ddd',
        borderRadius: 10,
      }}
    >
      <h3>Weekly availability</h3>

      <p className="muted">
        All times Eastern Time
        (Windsor/Essex).
      </p>

      <ul>
        {data.weekly.map(
          (slot, index) => (
            <li key={index}>
              {days[slot.dayOfWeek]}:{' '}
              {clock(slot.startMinute)}
              {' – '}
              {clock(slot.endMinute)}
            </li>
          )
        )}
      </ul>

      <h4>Suggested one-hour sessions</h4>

      {slots.length ? (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          {slots.map(slot => (
            <button
              key={slot.toISOString()}
              type="button"
              onClick={() => {
                window.dispatchEvent(
                  new CustomEvent(
                    'etc-suggested-time',
                    {
                      detail: {
                        tutorId,
                        time:
                          formatSuggestion(slot),
                      },
                    }
                  )
                );
              }}
              title="Add this time to your inquiry"
              style={{
                padding: '8px 10px',
                fontSize: 13,
              }}
            >
              {formatSuggestion(slot)}
            </button>
          ))}
        </div>
      ) : (
        <p className="muted">
          No one-hour suggestions
          currently available in the
          next 14 days.
        </p>
      )}

      <p
        className="muted"
        style={{ fontSize: 12 }}
      >
        Select a suggested time to add
        it to your inquiry. Times are
        not reserved until the booking
        is confirmed and paid.
      </p>
    </section>
  );
}
