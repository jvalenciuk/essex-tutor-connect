
'use client';

import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';

export default function AuthNavigation() {
  const { data: session, status } = useSession();

  if (status === 'loading') {
    return <Link href="/tutors">Find tutors</Link>;
  }

  if (!session) {
    return (
      <>
        <Link href="/tutors">Find tutors</Link>
        <Link href="/login">Sign In</Link>
        <Link href="/register">Join</Link>
      </>
    );
  }

  const role = (
    session.user as { role?: string } | undefined
  )?.role;

  return (
    <>
      <Link href="/tutors">Find tutors</Link>

      <Link href="/dashboard">Dashboard</Link>

      <Link href="/dashboard/bookings">
        My Bookings
      </Link>

      {role === 'ADMIN' && (
        <Link href="/admin">Admin</Link>
      )}

      <button
        type="button"
        onClick={() =>
          signOut({ callbackUrl: '/' })
        }
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
