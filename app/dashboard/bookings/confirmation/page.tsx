
'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

type Booking = {
  id: string;
  status: string;
  startsAt: string;
  durationMinutes: number;
  amountCents: number;
  tutor?: {
    user?: {
      name?: string | null;
    };
  };
  inquiry?: {
    subject?: string;
    grade?: string;
  } | null;
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
    dateStyle: 'full',
    timeStyle: 'short',
  });
}

export default function BookingConfirmationPage() {
  const params = useSearchParams();
  const bookingId = params.get('bookingId');
  const checkout = params.get('checkout');

  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    if (!bookingId) {
      setLoading(false);
      setError('No booking was specified.');
      return;
    }

    let active = true;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    async function checkBooking(attempt: number) {
      try {
        const response = await fetch('/api/bookings', {
          cache: 'no-store',
        });

        if (!response.ok) {
          throw new Error(
            'Unable to retrieve your booking. Please sign in and try again.'
          );
        }

        const data: unknown = await response.json();

        if (!Array.isArray(data)) {
          throw new Error('Unexpected booking response.');
        }

        const found = (data as Booking[]).find(
          item => item.id === bookingId
        );

        if (!found) {
          throw new Error(
            'Booking not found in your recent bookings.'
          );
        }

        if (!active) return;

        setBooking(found);
        setError('');
        setLoading(false);
        setAttempts(attempt);

        if (
          checkout === 'success' &&
          found.status === 'PENDING_PAYMENT' &&
          attempt < 8
        ) {
          timeout = setTimeout(
            () => void checkBooking(attempt + 1),
            3000
          );
        }
      } catch (err) {
        if (!active) return;

        setLoading(false);
        setError(
          err instanceof Error
            ? err.message
            : 'Unable to check booking.'
        );
      }
    }

    setLoading(true);
    void checkBooking(0);

    return () => {
      active = false;
      if (timeout) clearTimeout(timeout);
    };
  }, [bookingId, checkout]);

  const confirmed =
    booking?.status === 'PAID' ||
    booking?.status === 'COMPLETED';

  const cancelled =
    checkout === 'cancelled' &&
    booking?.status === 'PENDING_PAYMENT';

  return (
    <main style={{ maxWidth: 760, margin: '0 auto' }}>
      <Link href="/dashboard/bookings">
        Back to My Bookings
      </Link>

      <div className="card" style={{ marginTop: 24 }}>
        {loading ? (
          <>
            <h1>Checking your booking...</h1>
            <p className="muted">
              Retrieving the latest booking status.
            </p>
          </>
        ) : error ? (
          <>
            <h1>Unable to verify booking</h1>
            <p role="alert">{error}</p>
          </>
        ) : (
          <>
            <h1>
              {confirmed
                ? 'Booking Confirmed!'
                : cancelled
                  ? 'Checkout Not Completed'
                  : 'Payment Confirmation Pending'}
            </h1>

            {confirmed ? (
              <p>
                Your tutoring session is confirmed.
                Payment has been recorded successfully.
              </p>
            ) : cancelled ? (
              <p>
                You returned without completing checkout.
                Your booking has not been confirmed.
                You can return to My Bookings to review
                its current status.
              </p>
            ) : (
              <p>
                Your booking has not yet been marked paid.
                If you completed checkout, please wait
                while Stripe payment confirmation is processed.
                Do not submit another payment.
              </p>
            )}

            {booking && (
              <div style={{ marginTop: 24 }}>
                <h2>Session Details</h2>

                <p>
                  <strong>Tutor:</strong>{' '}
                  {booking.tutor?.user?.name || 'Tutor'}
                </p>

                <p>
                  <strong>Subject:</strong>{' '}
                  {booking.inquiry?.subject || 'Tutoring'}
                </p>

                {booking.inquiry?.grade && (
                  <p>
                    <strong>Grade:</strong>{' '}
                    {booking.inquiry.grade}
                  </p>
                )}

                <p>
                  <strong>Date and time:</strong>{' '}
                  {dateText(booking.startsAt)}
                </p>

                <p>
                  <strong>Duration:</strong>{' '}
                  {booking.durationMinutes} minutes
                </p>

                <p>
                  <strong>Session amount:</strong>{' '}
                  {money(booking.amountCents)}
                </p>

                <p>
                  <strong>Booking status:</strong>{' '}
                  {booking.status.replaceAll('_', ' ')}
                </p>
              </div>
            )}

            {!confirmed &&
              !cancelled &&
              attempts >= 8 && (
                <p className="muted">
                  Confirmation is taking longer than expected.
                  Please check My Bookings later or contact
                  support if the payment remains unconfirmed.
                </p>
              )}
          </>
        )}

        <div
          style={{
            display: 'flex',
            gap: 12,
            flexWrap: 'wrap',
            marginTop: 24,
          }}
        >
          <Link
            className="button"
            href="/dashboard/bookings"
          >
            View My Bookings
          </Link>

          <Link href="/dashboard">
            Go to Dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
