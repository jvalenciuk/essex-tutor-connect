'use client';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';

export default function ForgotPassword() {
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/password/forgot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: form.get('email') }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to request reset.');
      setMessage(result.message);
    } catch (e) { setError(e instanceof Error ? e.message : 'Please try again.'); }
    finally { setBusy(false); }
  }
  return <main className="signup-page"><div className="signup-heading"><h1>Reset your password</h1><p className="muted">Enter your account email to request a password reset.</p></div><form className="card signup-form" onSubmit={submit}><label htmlFor="reset-email">Email address</label><input className="field" id="reset-email" name="email" type="email" autoComplete="email" required />{message && <p role="status">{message}</p>}{error && <p className="error" role="alert">{error}</p>}<button className="signup-submit" type="submit" disabled={busy}>{busy ? 'Sending...' : 'Send reset instructions'}</button><p className="signup-signin"><Link href="/login">Back to sign in</Link></p></form></main>;
}
