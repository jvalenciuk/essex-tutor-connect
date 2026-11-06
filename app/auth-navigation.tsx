
'use client';

import { useSession, signOut } from 'next-auth/react';

export default function AuthNavigation() {
  const { data: session, status } = useSession();

  if (status === 'loading') {
    return (
      <>
        <a href="/tutors">Find tutors</a>
      </>
    );
  }

  if (!session) {
    return (
      <>
        <a href="/tutors">Find tutors</a>
        <a href="/login">Sign In</a>
        <a href="/register">Join</a>
      </>
    );
  }

  const role = (session.user as { role?: string } | undefined)?.role;

  return (
    <>
      <a href="/tutors">Find tutors</a>
      <a href="/dashboard">Dashboard</a>

      {role === 'ADMIN' && (
        <a href="/admin">Admin</a>
      )}

      <button
        type="button"
        onClick={() => signOut({ callbackUrl: '/' })}
        style={{
          background: 'transparent',
          border: 'none',
          padding: 0,
          color: 'inherit',
          font: 'inherit',
          cursor: 'pointer',
        }}
      >
        Sign Out
      </button>
    </>
  );
}
