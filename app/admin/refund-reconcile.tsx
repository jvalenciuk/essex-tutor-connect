'use client';

import { useState } from 'react';

export default function RefundReconcile() {
  const [bookingId, setBookingId] = useState('');
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');

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
