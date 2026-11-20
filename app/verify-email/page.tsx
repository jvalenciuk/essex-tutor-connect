'use client';
import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

function Verify() {
  const token = useSearchParams().get('token');
  const [message, setMessage] = useState('Checking your verification link...');
  useEffect(() => {
    if (!token) { setMessage('Missing verification link.'); return; }
    let active = true;
    fetch('/api/email/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) })
      .then(async r => { const data = await r.json(); if (!r.ok) throw new Error(data.error || 'Verification failed.'); return data.message as string; })
      .then(m => { if (active) setMessage(m); })
      .catch(e => { if (active) setMessage(e instanceof Error ? e.message : 'Verification failed.'); });
    return () => { active = false; };
  }, [token]);
  return <main className="signup-page"><div className="signup-heading"><h1>Verify your email</h1><p role="status">{message}</p><p><Link href="/login">Go to sign in</Link></p></div></main>;
}
export default function VerifyEmailPage() { return <Suspense fallback={<p>Loading verification...</p>}><Verify /></Suspense>; }
