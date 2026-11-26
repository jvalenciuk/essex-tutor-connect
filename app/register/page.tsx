import Link from 'next/link';
import { accountEmailConfig } from '../../lib/account-email';
import RegisterForm from './register-form';

export const dynamic = 'force-dynamic';

export default function RegisterPage() {
  if (accountEmailConfig()) return <RegisterForm />;

  return (
    <main className="signup-page">
      <div className="signup-heading">
        <h1>Registration is temporarily paused</h1>
        <p className="muted">New accounts will be available when email verification is ready.</p>
      </div>
      <div className="card signup-form">
        <p>Already have an account? <Link href="/login">Sign in</Link></p>
        <Link href="/tutors">Find tutors</Link>
      </div>
    </main>
  );
}
