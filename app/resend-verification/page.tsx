'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';

export default function ResendVerification() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/email/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await response.json();
      setMessage(data.message || data.error || 'Please try again.');
    } catch {
      setMessage('Unable to send your request. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="signup-page">
      <div className="signup-heading">
        <h1>Verify your email</h1>
        <p className="muted">Need a new verification link? Enter the email address you used to register.</p>
      </div>
      <form className="card signup-form" onSubmit={submit}>
        <label htmlFor="verification-email">Email address</label>
        <input id="verification-email" className="field" type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} />
        <button className="signup-submit" type="submit" disabled={busy}>{busy ? 'Sending...' : 'Send verification link'}</button>
        {message && <p role="status">{message}</p>}
        <p className="signup-signin"><Link href="/login">Back to sign in</Link></p>
      </form>
    </main>
  );
}
