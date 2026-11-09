
'use client';

import { useEffect, useState } from 'react';

type Slot = {
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
};

const days = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

const defaults: Slot[] = [1, 2, 3, 4, 5].map(
  dayOfWeek => ({
    dayOfWeek,
    startMinute: 960,
    endMinute: 1200,
  })
);

const clock = (n: number) =>
  `${String(Math.floor(n / 60)).padStart(2, '0')}:` +
  `${String(n % 60).padStart(2, '0')}`;

const minute = (s: string) => {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
};

export default function AvailabilityManager() {
  const [weekly, setWeekly] = useState<Slot[]>([]);
  const [blockedDates, setBlockedDates] =
    useState<string[]>([]);
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/tutor/availability', {
      cache: 'no-store',
    })
      .then(async r => {
        if (!r.ok) {
          throw new Error(
            'Unable to load availability'
          );
        }
        return r.json();
      })
      .then(data => {
        setWeekly(data.weekly);
        setBlockedDates(data.blockedDates);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  function toggle(dayOfWeek: number) {
    setWeekly(old =>
      old.some(s => s.dayOfWeek === dayOfWeek)
        ? old.filter(
            s => s.dayOfWeek !== dayOfWeek
          )
        : [
            ...old,
            {
              dayOfWeek,
              startMinute: 960,
              endMinute: 1200,
            },
          ]
    );
  }

  function update(
    dayOfWeek: number,
    field: 'startMinute' | 'endMinute',
    value: string
  ) {
    setWeekly(old =>
      old.map(s =>
        s.dayOfWeek === dayOfWeek
          ? {
              ...s,
              [field]: minute(value),
            }
          : s
      )
    );
  }

  async function save() {
    setBusy(true);
    setError('');
    setMessage('');

    try {
      const r = await fetch(
        '/api/tutor/availability',
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            weekly,
            blockedDates,
          }),
        }
      );

      const result = await r.json();

      if (!r.ok) {
        throw new Error(
          result.error ||
            'Could not save availability'
        );
      }

      setMessage(
        'Availability saved. New booking proposals will follow these settings.'
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Could not save availability'
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="card"
      style={{ marginTop: 20 }}
    >
      <h2>Manage availability</h2>

      <p>
        Set your recurring hours and blocked dates.
        All times are Windsor/Essex local time
        (Eastern Time).
      </p>

      {loading ? (
        <p>Loading...</p>
      ) : (
        <>
          {weekly.length === 0 && (
            <p>
              No weekly schedule saved yet.
              Choose days below to activate
              availability restrictions.
            </p>
          )}

          <div
            style={{
              display: 'grid',
              gap: 10,
            }}
          >
            {days.map((name, dayOfWeek) => {
              const s = weekly.find(
                v => v.dayOfWeek === dayOfWeek
              );

              return (
                <div
                  key={name}
                  style={{
                    display: 'flex',
                    gap: 12,
                    alignItems: 'center',
                    flexWrap: 'wrap',
                  }}
                >
                  <label
                    style={{ minWidth: 130 }}
                  >
                    <input
                      type="checkbox"
                      checked={!!s}
                      onChange={() =>
                        toggle(dayOfWeek)
                      }
                    />{' '}
                    {name}
                  </label>

                  {s && (
                    <>
                      <label>
                        From{' '}
                        <input
                          type="time"
                          value={clock(
                            s.startMinute
                          )}
                          onChange={e =>
                            update(
                              dayOfWeek,
                              'startMinute',
                              e.target.value
                            )
                          }
                        />
                      </label>

                      <label>
                        To{' '}
                        <input
                          type="time"
                          value={clock(
                            s.endMinute
                          )}
                          onChange={e =>
                            update(
                              dayOfWeek,
                              'endMinute',
                              e.target.value
                            )
                          }
                        />
                      </label>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() =>
              setWeekly(
                defaults.map(s => ({ ...s }))
              )
            }
            style={{ marginTop: 12 }}
          >
            Use Mon–Fri 4–8 PM example
          </button>

          <h3>Blocked dates</h3>

          <p>
            Block an entire date, even when it
            normally falls within your weekly hours.
          </p>

          <div
            style={{
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap',
            }}
          >
            <input
              aria-label="Date to block"
              type="date"
              value={date}
              onChange={e =>
                setDate(e.target.value)
              }
            />

            <button
              type="button"
              onClick={() => {
                if (date) {
                  setBlockedDates(old =>
                    [
                      ...new Set([
                        ...old,
                        date,
                      ]),
                    ].sort()
                  );
                }
                setDate('');
              }}
            >
              Block date
            </button>
          </div>

          {blockedDates.length === 0 ? (
            <p>No blocked dates.</p>
          ) : (
            <ul>
              {blockedDates.map(d => (
                <li key={d}>
                  {d}{' '}
                  <button
                    type="button"
                    onClick={() =>
                      setBlockedDates(old =>
                        old.filter(x => x !== d)
                      )
                    }
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
          >
            {busy
              ? 'Saving...'
              : 'Save availability'}
          </button>
        </>
      )}

      {message && (
        <p
          role="status"
          style={{ color: 'green' }}
        >
          {message}
        </p>
      )}

      {error && (
        <p
          role="alert"
          style={{ color: 'darkred' }}
        >
          {error}
        </p>
      )}
    </section>
  );
}
