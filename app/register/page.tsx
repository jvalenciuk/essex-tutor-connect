'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useState, type FormEvent } from 'react';

type AccountRole = 'PARENT' | 'TUTOR';

function RegisterForm() {
  const params = useSearchParams();
  const [role, setRole] = useState<AccountRole>(params.get('role')?.toUpperCase() === 'TUTOR' ? 'TUTOR' : 'PARENT');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password') || '');
    if (password.length < 12) {
      setError('Use a password of at least 12 characters.');
      setBusy(false);
      return;
    }
    try {
      const response = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: String(form.get('name') || '').trim(),
          email: String(form.get('email') || '').trim(),
          password,
          role,
        }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error || 'Could not create your account. Please try again.');
      }
      window.location.assign('/login?verification=required');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed. Please try again.');
      setBusy(false);
    }
  }

  return (
    <main className="signup-page">
      <div className="signup-heading">
        <p className="home-section-kicker">JOIN WE LEARN</p>
        <h1>Create your account</h1>
        <p className="muted">Choose how you will use the platform. You can create an account for free.</p>
      </div>

      <form className="card signup-form" onSubmit={submit}>
        <fieldset className="signup-role-fieldset">
          <legend>I am joining as a...</legend>
          <div className="signup-role-grid">
            <label className={role === 'PARENT' ? 'signup-role selected' : 'signup-role'}>
              <input type="radio" name="accountRole" value="PARENT" checked={role === 'PARENT'} onChange={() => setRole('PARENT')} />
              <span><strong>Parent or learner</strong><small>Find tutors, discuss goals and book sessions.</small></span>
            </label>
            <label className={role === 'TUTOR' ? 'signup-role selected' : 'signup-role'}>
              <input type="radio" name="accountRole" value="TUTOR" checked={role === 'TUTOR'} onChange={() => setRole('TUTOR')} />
              <span><strong>Tutor</strong><small>Create a profile, set your rate and receive inquiries.</small></span>
            </label>
          </div>
        </fieldset>

        <label htmlFor="register-name">Full name</label>
        <input id="register-name" required className="field" name="name" autoComplete="name" maxLength={100} placeholder="Your first and last name" />

        <label htmlFor="register-email">Email address</label>
        <input id="register-email" required type="email" className="field" name="email" autoComplete="email" maxLength={200} placeholder="you@example.com" />

        <label htmlFor="register-password">Password</label>
        <input id="register-password" required minLength={12} maxLength={128} type={showPassword ? 'text' : 'password'} className="field" name="password" autoComplete="new-password" placeholder="At least 12 characters" />
        <label className="signup-show-password">
          <input type="checkbox" checked={showPassword} onChange={event => setShowPassword(event.target.checked)} /> Show password
        </label>

        {role === 'TUTOR' && <p className="signup-info">After signing in, you will complete your tutor profile, set your availability and submit it for approval. Stripe setup follows approval.</p>}
        {error && <p className="error" role="alert">{error}</p>}
        <button type="submit" disabled={busy} className="signup-submit">{busy ? 'Creating your account...' : 'Create free account'}</button>
        <p className="signup-signin">Already have an account? <Link href="/login">Sign in</Link></p>
      </form>
    </main>
  );
}

export default function Register() {
  return <Suspense fallback={<main className="signup-page"><p>Loading registration...</p></main>}><RegisterForm /></Suspense>;
}
