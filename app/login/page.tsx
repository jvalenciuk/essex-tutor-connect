'use client';

import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useState, type FormEvent } from 'react';

function LoginForm() {
  const params = useSearchParams();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState('');
  const [verificationMessage, setVerificationMessage] = useState('');
  const registered = params.get('registered') === '1';
  const verificationRequired = params.get('verification') === 'required';
  const deliveryFailed = params.get('delivery') === 'failed';
  const tutor = params.get('role') === 'tutor';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    const data = new FormData(event.currentTarget);
    try {
      const result = await signIn('credentials', {
        email: data.get('email'),
        password: data.get('password'),
        redirect: false,
      });
      if (!result?.ok) {
        setError('Email or password was not recognized. Please check your details.');
        setBusy(false);
        return;
      }
      window.location.assign(tutor ? '/dashboard/onboarding' : '/dashboard');
    } catch {
      setError('Unable to sign in right now. Please try again.');
      setBusy(false);
    }
  }

  return (
    <main className="signup-page">
      <div className="signup-heading">
        <h1>Welcome back</h1>
        <p className="muted">Sign in to manage your tutoring sessions and messages.</p>
      </div>
      <form className="card signup-form" onSubmit={submit}>
        {verificationRequired && <p className={deliveryFailed ? 'error' : 'signup-success'} role="status">{deliveryFailed ? 'Your account was created, but the verification email could not be delivered. Use the resend form below. During Preview testing, messages go to the configured test inbox.' : 'Account created. Please verify your email before signing in. During Preview testing, verification links are sent to the configured test inbox.'}</p>}
        {registered && <p className="signup-success" role="status">Account created! Sign in with your new email and password.{tutor ? ' Next, you can complete your tutor profile.' : ''}</p>}
        <label htmlFor="login-email">Email address</label>
        <input id="login-email" className="field" type="email" name="email" autoComplete="email" required />
        <label htmlFor="login-password">Password</label>
        <input id="login-password" className="field" type="password" name="password" autoComplete="current-password" required />
        {error && <p className="error" role="alert">{error}</p>}
        <button disabled={busy} type="submit" className="signup-submit">{busy ? 'Signing in...' : 'Sign in'}</button>
        <div><label htmlFor="verify-email-address">Need another verification link?</label><input id="verify-email-address" className="field" type="email" placeholder="Your account email" value={verificationEmail} onChange={e => setVerificationEmail(e.target.value)} /><button type="button" className="signup-submit" onClick={async () => { try { const r = await fetch('/api/email/resend', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: verificationEmail }) }); const data = await r.json(); setVerificationMessage(data.message || data.error || 'Please try again.'); } catch { setVerificationMessage('Please try again.'); } }}>Resend verification email</button>{verificationMessage && <p role="status">{verificationMessage}</p>}</div>
        <p className="signup-signin"><Link href="/forgot-password">Forgot your password?</Link></p>
        <p className="signup-signin">New to WE Learn? <Link href="/register">Create an account</Link></p>
      </form>
    </main>
  );
}

export default function Login() {
  return <Suspense fallback={<main className="signup-page"><p>Loading sign in...</p></main>}><LoginForm /></Suspense>;
}
