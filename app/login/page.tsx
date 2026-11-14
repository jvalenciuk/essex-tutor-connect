'use client';

import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';

export default function Login() {
  const params = useSearchParams();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const registered = params.get('registered') === '1';
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
        {registered && <p className="signup-success" role="status">Account created! Sign in with your new email and password.{tutor ? ' Next, you can complete your tutor profile.' : ''}</p>}
        <label htmlFor="login-email">Email address</label>
        <input id="login-email" className="field" type="email" name="email" autoComplete="email" required />
        <label htmlFor="login-password">Password</label>
        <input id="login-password" className="field" type="password" name="password" autoComplete="current-password" required />
        {error && <p className="error" role="alert">{error}</p>}
        <button disabled={busy} type="submit" className="signup-submit">{busy ? 'Signing in...' : 'Sign in'}</button>
        <p className="signup-signin">New to Essex Tutor Connect? <Link href="/register">Create an account</Link></p>
      </form>
    </main>
  );
}
