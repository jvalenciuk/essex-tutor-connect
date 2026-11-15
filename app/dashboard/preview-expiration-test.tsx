'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const TEST_BOOKING_ID = 'cmwie6pln0001l308syy1xw5n';

export default function PreviewExpirationTest({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  if (bookingId !== TEST_BOOKING_ID) return null;

  async function runTest() {
    if (!window.confirm('TEST ONLY: Cancel the November 26 unpaid booking now and send expiration notifications? This cannot be undone.')) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/preview-test/expire-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, confirm: 'EXPIRE_PREVIEW_TEST_BOOKING' }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || 'Test did not complete.');
      setMessage('Test passed: booking cancelled. Check email and calendar.');
      window.dispatchEvent(new Event('essex:bookings-updated'));
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Test failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <span style={{ display: 'inline-block', marginLeft: 12 }}>
      <button type="button" disabled={busy} onClick={runTest} style={{ padding: '7px 12px', cursor: busy ? 'wait' : 'pointer' }}>
        {busy ? 'Running test…' : 'Run expiration test'}
      </button>
      {message && <span role="status" style={{ marginLeft: 8 }}>{message}</span>}
    </span>
  );
}
