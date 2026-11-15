'use client';

import { useState } from 'react';

export default function DirectPaymentButton({ bookingId, amount }: { bookingId: string; amount: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function pay() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || 'Unable to start payment.');
      if (typeof result?.url !== 'string' || !result.url.startsWith('https://checkout.stripe.com/')) {
        throw new Error('Stripe did not return a valid payment link.');
      }
      window.location.assign(result.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start payment.');
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 12 }}>
      <button type="button" onClick={pay} disabled={busy} className="button">
        {busy ? 'Opening secure checkout...' : `Pay ${amount} securely`}
      </button>
      {error && <p role="alert" style={{ color: '#b91c1c', marginTop: 8 }}>{error}</p>}
    </div>
  );
}
