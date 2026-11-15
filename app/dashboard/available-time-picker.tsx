'use client';

import { useEffect, useMemo, useState } from 'react';

type Availability = {
  weekly: { dayOfWeek: number; startMinute: number; endMinute: number }[];
  blockedDates: string[];
  busy: { startsAt: string; durationMinutes: number }[];
  timeZone: string;
};
type Props = {
  tutorId: string;
  duration: string;
  onDurationChange: (value: string) => void;
  startsAt: string;
  onStartsAtChange: (value: string) => void;
};

const ZONE = 'America/Toronto';
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAYS = 14;
const fmt = (date: Date, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, ...options }).format(date);

function localParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const part = (type: string) => parts.find(item => item.type === type)?.value || '';
  return {
    date: `${part('year')}-${part('month')}-${part('day')}`,
    day: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(part('weekday')),
    minute: Number(part('hour')) * 60 + Number(part('minute')),
  };
}

export default function AvailableTimePicker({
  tutorId, duration, onDurationChange, startsAt, onStartsAtChange,
}: Props) {
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [selectedDay, setSelectedDay] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    fetch(`/api/tutors/${encodeURIComponent(tutorId)}/availability`, {
      cache: 'no-store', signal: controller.signal,
    })
      .then(async response => {
        if (!response.ok) throw new Error('Unable to load tutor availability.');
        return response.json() as Promise<Availability>;
      })
      .then(setAvailability)
      .catch(err => {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Availability unavailable.');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [tutorId, refresh]);

  const options = useMemo(() => {
    if (!availability) return [] as { key: string; slots: Date[] }[];
    const minutes = Number(duration);
    const now = Date.now();
    const first = Math.ceil((now + HOUR) / (30 * MINUTE)) * 30 * MINUTE;
    const limit = now + DAYS * 24 * HOUR;
    const blocked = new Set(availability.blockedDates);
    const busy = availability.busy.map(b => ({
      start: new Date(b.startsAt).getTime(),
      end: new Date(b.startsAt).getTime() + b.durationMinutes * MINUTE,
    }));
    const groups = new Map<string, Date[]>();
    for (let time = first; time < limit; time += 30 * MINUTE) {
      const start = new Date(time);
      const end = new Date(time + minutes * MINUTE);
      const a = localParts(start);
      const b = localParts(new Date(end.getTime() - 1));
      const c = localParts(end);
      if (a.date !== b.date || a.date !== c.date || blocked.has(a.date)) continue;
      if (!availability.weekly.some(w =>
        w.dayOfWeek === a.day && a.minute >= w.startMinute && c.minute <= w.endMinute
      )) continue;
      if (busy.some(busySlot => time < busySlot.end && busySlot.start < end.getTime())) continue;
      const slots = groups.get(a.date) || [];
      slots.push(start);
      groups.set(a.date, slots);
    }
    return Array.from(groups, ([key, slots]) => ({ key, slots }));
  }, [availability, duration]);

  const day = options.some(o => o.key === selectedDay) ? selectedDay : options[0]?.key || '';
  const times = options.find(o => o.key === day)?.slots || [];
  const selectedAvailable = options.some(group => group.slots.some(date => date.toISOString() === startsAt));

  return (
    <div style={{ display: 'grid', gap: 14, margin: '16px 0' }}>
      <label style={{ fontWeight: 700 }}>
        Session duration
        <select className="field" value={duration} onChange={event => {
          onDurationChange(event.target.value);
          onStartsAtChange('');
        }}>
          {[30,60,90,120,180].map(value => <option key={value} value={value}>{value} minutes</option>)}
        </select>
      </label>
      <div>
        <strong>1. Choose an available date</strong>
        {loading && <p className="muted">Loading available dates...</p>}
        {error && <p role="alert">{error} <button type="button" onClick={() => setRefresh(n => n + 1)}>Retry</button></p>}
        {!loading && !error && !options.length && (
          <p className="muted">No available times in the next 14 days for this duration. Try a shorter session or contact your tutor.</p>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(105px, 1fr))', gap: 8, marginTop: 10 }}>
          {options.map(group => {
            const date = group.slots[0];
            return <button key={group.key} type="button" aria-pressed={day === group.key}
              onClick={() => { setSelectedDay(group.key); onStartsAtChange(''); }}
              style={{ padding: '12px 8px', background: day === group.key ? '#123b61' : '#f5f8fc',
                color: day === group.key ? '#fff' : '#123b61', border: '1px solid #cbd5e1', borderRadius: 9 }}>
              {fmt(date, { weekday: 'short', month: 'short', day: 'numeric' })}
            </button>;
          })}
        </div>
      </div>
      {day && <div>
        <strong>2. Choose a time</strong>
        <p className="muted" style={{ margin: '5px 0' }}>Eastern Time (Windsor/Essex). Times shown reflect the tutor's schedule and currently reserved sessions.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8, marginTop: 10 }}>
          {times.map(date => {
            const iso = date.toISOString();
            const chosen = startsAt === iso;
            return <button type="button" key={iso} aria-pressed={chosen} onClick={() => onStartsAtChange(iso)}
              style={{ padding: 11, background: chosen ? '#123b61' : '#fff',
                color: chosen ? '#fff' : '#123b61', border: '1px solid #9bb1c5', borderRadius: 9 }}>
              {fmt(date, { hour: 'numeric', minute: '2-digit' })}
            </button>;
          })}
        </div>
      </div>}
      {startsAt && selectedAvailable && (
        <p role="status" style={{ fontWeight: 700, color: '#166534' }}>
          Selected: {fmt(new Date(startsAt), { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · {duration} minutes
        </p>
      )}
      {startsAt && !selectedAvailable && <p role="alert">This time is no longer available. Choose another slot.</p>}
      <button type="button" onClick={() => setRefresh(n => n + 1)} style={{ justifySelf: 'start' }}>
        Refresh availability
      </button>
      <p className="muted" style={{ fontSize: 12 }}>Availability may change before your request is accepted. The server checks for conflicts again when booking.</p>
    </div>
  );
}
