'use client';
import Link from 'next/link';
import { Suspense, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';

function ResetForm() {
  const token = useSearchParams().get('token') || '';
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password') || '');
    if (password !== String(form.get('confirm') || '')) { setError('Passwords do not match.'); setBusy(false); return; }
    try {
      const response = await fetch('/api/password/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, password }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to reset password.');
      setMessage(result.message);
    } catch (e) { setError(e instanceof Error ? e.message : 'Please try again.'); }
    finally { setBusy(false); }
  }
  return <main className="signup-page"><div className="signup-heading"><h1>Choose a new password</h1><p className="muted">Reset links expire after 30 minutes.</p></div><form className="card signup-form" onSubmit={submit}>{!token && <p className="error">Missing reset link. Request a new one.</p>}{!message && <><label htmlFor="new-password">New password</label><input id="new-password" className="field" name="password" type="password" minLength={12} maxLength={128} autoComplete="new-password" required /><label htmlFor="confirm-password">Confirm new password</label><input id="confirm-password" className="field" name="confirm" type="password" minLength={12} maxLength={128} autoComplete="new-password" required /></>}{message && <p role="status">{message}</p>}{error && <p className="error" role="alert">{error}</p>}{!message && <button className="signup-submit" type="submit" disabled={busy || !token}>{busy ? 'Updating...' : 'Update password'}</button>}<p className="signup-signin"><Link href="/login">Return to sign in</Link></p></form></main>;
}
export default function ResetPassword() { return <Suspense fallback={<p>Loading...</p>}><ResetForm /></Suspense>; }
