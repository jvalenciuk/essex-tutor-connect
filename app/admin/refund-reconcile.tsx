'use client';

import { useState } from 'react';

export default function RefundReconcile() {
  const [bookingId, setBookingId] = useState('');
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{
    discrepancies: Array<{ bookingId: string; tutor: string; parent: string; amountCents: number; status: string }>;
    checked: number; unavailable: number; scanned: number; limited: boolean;
  } | null>(null);
  const [scanError, setScanError] = useState('');

  async function scanRefunds() {
    setScanning(true);
    setScanError('');
    setScanResult(null);
    try {
      const response = await fetch('/api/admin/refunds/scan', { method: 'POST' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Scan failed.');
      setScanResult(result);
    } catch (error) {
      setScanError(error instanceof Error ? error.message : 'Unable to scan refunds.');
    } finally {
      setScanning(false);
    }
  }


  async function reconcile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!bookingId.trim() || working) return;
    setWorking(true);
    setMessage('');
    try {
      const response = await fetch('/api/admin/refunds/reconcile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: bookingId.trim() }),
      });
      const result = await response.json();
      if (!response.ok) {
        setMessage(result.error || 'Unable to verify this refund.');
      } else {
        setMessage(result.alreadyReconciled
          ? 'This booking was already marked refunded.'
          : 'Stripe full refund verified and booking marked refunded. Refresh dashboard totals.');
      }
    } catch {
      setMessage('Network error. No new refund was requested.');
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className="card" style={{ marginTop: 28 }}>
      <h2>Refund reconciliation</h2>
      <p className="muted">
        Use only when Stripe shows a completed refund but the booking still shows PAID.
        This verifies an existing refund. It never issues a new one.
      </p>
      <h3>Find refund discrepancies</h3>
      <p className="muted">
        Check up to 25 recently updated paid bookings against Stripe.
        This is a read-only check, not a complete audit of all payments.
      </p>
      <button type="button" onClick={() => void scanRefunds()} disabled={scanning}>
        {scanning ? 'Checking Stripe…' : 'Scan recent paid bookings'}
      </button>
      {scanError && <p role="alert">{scanError}</p>}
      {scanResult && (
        <div aria-live="polite" style={{ marginTop: 12 }}>
          <p>
            Checked {scanResult.checked} of {scanResult.scanned} bookings.
            {scanResult.unavailable > 0
              ? ' ' + scanResult.unavailable + ' could not be verified and require manual review.'
              : ''}
            {scanResult.limited ? ' Only the 25 most recently updated paid bookings were scanned.' : ''}
          </p>
          {scanResult.discrepancies.length === 0 ? (
            <p>No refund discrepancies detected among successfully checked bookings.</p>
          ) : (
            <ul>
              {scanResult.discrepancies.map(item => (
                <li key={item.bookingId} style={{ marginBottom: 12 }}>
                  <strong>{item.status}</strong>
                  <p>{item.parent} with {item.tutor} · CAD {(item.amountCents / 100).toFixed(2)}</p>
                  <code>{item.bookingId}</code>{' '}
                  <button type="button" onClick={() => setBookingId(item.bookingId)}>
                    Use this booking ID
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <h3 style={{ marginTop: 24 }}>Verify a specific booking</h3>
      <form onSubmit={reconcile}>
        <label htmlFor="refund-booking-id">Booking ID</label>
        <input
          id="refund-booking-id"
          value={bookingId}
          onChange={event => setBookingId(event.target.value)}
          placeholder="Paste the booking ID"
          required
          style={{ display: 'block', margin: '10px 0', width: '100%', maxWidth: 450 }}
        />
        <button type="submit" disabled={working || !bookingId.trim()}>
          {working ? 'Checking Stripe…' : 'Verify and reconcile existing refund'}
        </button>
      </form>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
