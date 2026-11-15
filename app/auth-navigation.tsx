
'use client';

import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import { useState } from 'react';

export default function AuthNavigation() {
  const { data: session, status, update } = useSession();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    if (signingOut) return;

    setSigningOut(true);

    try {
      await signOut({
        redirect: false,
        callbackUrl: '/',
      });

      await update();

      // Full navigation clears stale client-side state
      // and stays on the current Preview or Production domain.
      window.location.replace(
        window.location.origin + '/'
      );
    } catch (error) {
      console.error('Sign-out failed:', error);
      setSigningOut(false);
    }
  };

  if (status === 'loading' || signingOut) {
    return (
      <Link href="/tutors">
        Find tutors
      </Link>
    );
  }

  if (status === 'unauthenticated' || !session?.user) {
    return (
      <>
        <Link href="/tutors">
          Find tutors
        </Link>

        <Link href="/login">
          Sign In
        </Link>

        <Link href="/register">
          Join
        </Link>
      </>
    );
  }

  const currentUser = session.user as { role?: string; name?: string | null; email?: string | null };
  // NextAuth stores the role on the session root, not session.user.
  const role = (session as typeof session & { role?: string }).role || currentUser.role;
  const displayName = currentUser.name?.trim() || currentUser.email || 'Account';
  const roleLabel = role === 'TUTOR' ? 'Tutor' : role === 'PARENT' ? 'Parent' : role === 'ADMIN' ? 'Admin' : 'Member';

  return (
    <>
      <Link href="/tutors">
        Find tutors
      </Link>

      <Link href="/dashboard">
        Dashboard
      </Link>

      <Link href="/dashboard/bookings">
        My Sessions
      </Link>

      {role === 'ADMIN' && (
        <Link href="/admin">
          Admin
        </Link>
      )}

      <span className="signed-in-identity" aria-label={`Signed in as ${displayName}, ${roleLabel}`}>
        <span className="signed-in-identity-label">Signed in as</span>
        <strong>{displayName}</strong>
        <span className="signed-in-role">{roleLabel}</span>
      </span>

      <button
        type="button"
        onClick={handleSignOut}
        disabled={signingOut}
        style={{
          background: 'transparent',
          border: 'none',
          padding: 0,
          color: 'inherit',
          font: 'inherit',
          cursor: signingOut ? 'wait' : 'pointer',
        }}
      >
        Sign Out
      </button>
    </>
  );
}
