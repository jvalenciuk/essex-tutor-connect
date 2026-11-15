
'use client';

import {
  useEffect,
  useState,
} from 'react';

type SuggestedTimeDetail = {
  tutorId: string;
  time: string;
};

export default function InquiryForm({
  tutorId,
  name,
}: {
  tutorId: string;
  name: string;
}) {
  const [open, setOpen] =
    useState(false);

  const [subject, setSubject] =
    useState('');

  const [grade, setGrade] =
    useState('');

  const [message, setMessage] =
    useState('');

  const [status, setStatus] =
    useState('');

  const [busy, setBusy] =
    useState(false);

  const [preferredTime, setPreferredTime] =
    useState('');
  const [sent, setSent] = useState(false);

  useEffect(() => {
    function receiveTime(event: Event) {
      const detail = (
        event as CustomEvent<
          SuggestedTimeDetail
        >
      ).detail;

      if (
        !detail ||
        detail.tutorId !== tutorId
      ) {
        return;
      }

      setPreferredTime(detail.time);
      setOpen(true);
      setSent(false);
      setStatus('');
    }

    window.addEventListener(
      'etc-suggested-time',
      receiveTime
    );

    return () => {
      window.removeEventListener(
        'etc-suggested-time',
        receiveTime
      );
    };
  }, [tutorId]);

  async function submit(
    e: React.FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();
    setBusy(true);
    setStatus('');

    try {
      const finalMessage = preferredTime
        ? `${message.trim()}\n\nPreferred session time (Eastern Time): ${preferredTime}. This is a request, not a confirmed booking.`
        : message.trim();

      const response = await fetch(
        '/api/inquiries',
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json',
          },
          body: JSON.stringify({
            tutorId,
            subject: subject.trim(),
            grade: grade.trim(),
            message: finalMessage,
          }),
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            'Request failed'
        );
      }

      setSent(true);
      setStatus('Inquiry sent successfully. Your tutor can now review your request.');

      setOpen(false);
      setSubject('');
      setGrade('');
      setMessage('');
      setPreferredTime('');
    } catch (error) {
      setStatus(
        (error instanceof Error
          ? error.message
          : 'Request failed') +
          ' — please sign in as a parent if necessary.'
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button type="button" aria-expanded={open} onClick={() => { setOpen(!open); setSent(false); setStatus(''); }}>
        {open ? 'Close inquiry form' : `Request tutoring with ${name.split(' ')[0]}`}
      </button>

      {open && (
        <form
          onSubmit={submit}
          style={{
            marginTop: 16,
          }}
        >
          {preferredTime && (
            <div
              style={{
                padding: 12,
                border:
                  '1px solid #a5d6c7',
                borderRadius: 8,
                marginBottom: 12,
              }}
            >
              <strong>
                Preferred session time
              </strong>

              <p>{preferredTime}</p>

              <p className="muted">
                The tutor must confirm
                this time before you
                can book and pay.
              </p>

              <button
                type="button"
                onClick={() =>
                  setPreferredTime('')
                }
              >
                Remove preferred time
              </button>
            </div>
          )}

          <label>
            Subject
            <input
              className="field"
              required
              maxLength={100}
              value={subject}
              onChange={e =>
                setSubject(
                  e.target.value
                )
              }
            />
          </label>

          <label>
            Student grade
            (do not enter a child&apos;s name)
            <input
              className="field"
              required
              maxLength={60}
              value={grade}
              onChange={e =>
                setGrade(
                  e.target.value
                )
              }
            />
          </label>

          <label>
            Learning goals and preferred schedule
            <textarea
              className="field"
              required
              minLength={20}
              maxLength={1800}
              rows={4}
              value={message}
              onChange={e =>
                setMessage(
                  e.target.value
                )
              }
            />
          </label>

          <p className="muted">
            Only parents, guardians,
            or adult learners should
            send inquiries. Do not
            include a child&apos;s
            contact information.
          </p>

          <button disabled={busy}>
            {busy
              ? 'Sending…'
              : 'Send free inquiry'}
          </button>
        </form>
      )}

      {status && (
        <div role="status" className={sent ? 'card' : undefined} style={{ marginTop: 12 }}>
          <p>{status}</p>
          {sent && <a href="/dashboard">Go to dashboard to track your inquiry</a>}
        </div>
      )}
    </div>
  );
}
