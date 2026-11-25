'use client';

import { useState } from 'react';

export default function EnableTransfersButton() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);

  async function requestTransfers() {
    setLoading(true);
    setMessage('');
    setSuccess(false);
    try {
      const response = await fetch('/api/connect/enable-transfers', { method: 'POST' });
      const result = await response.json();
      setMessage(result.message || 'No response from Stripe.');
      setSuccess(Boolean(result.ok));
    } catch {
      setMessage('Unable to reach the server. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ marginTop: 16, marginBottom: 16 }}>
      <button type="button" disabled={loading} onClick={requestTransfers}>
        {loading ? 'Checking Stripe…' : 'Enable transfers'}
      </button>
      <p className="muted" style={{ marginTop: 8 }}>
        Requests permission for WE Learn to transfer tutor earnings. This does not start identity verification or charge a card.
      </p>
      {message && <p role="status" style={{ overflowWrap: 'anywhere', color: success ? 'inherit' : '#a12b2b' }}>{message}</p>}
    </div>
  );
}
