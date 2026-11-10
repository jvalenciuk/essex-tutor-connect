
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { identity } from '../../../lib/security';
import { db } from '../../../lib/db';

import DashboardForm from '../profile-form';
import AvailabilityManager from '../availability-manager';
import ConnectButton from '../connect-button';

export const dynamic = 'force-dynamic';

type Step = {
  title: string;
  description: string;
  complete: boolean;
  detail: string;
};

async function getStripeStatus(
  accountId: string | null | undefined
) {
  const result = {
    connected: Boolean(accountId),
    paymentsEnabled: false,
    payoutsEnabled: false,
    error: '',
  };

  if (!accountId) {
    return result;
  }

  const key = process.env.STRIPE_SECRET_KEY;

  if (!key) {
    return {
      ...result,
      error: 'Stripe configuration unavailable.',
    };
  }

  try {
    const response = await fetch(
      `https://api.stripe.com/v1/accounts/${encodeURIComponent(
        accountId
      )}`,
      {
        headers: {
          Authorization: `Bearer ${key}`,
        },
        cache: 'no-store',
      }
    );

    if (!response.ok) {
      return {
        ...result,
        error: 'Unable to verify Stripe status.',
      };
    }

    const account = await response.json();

    return {
      connected: true,
      paymentsEnabled:
        account.charges_enabled === true,
      payoutsEnabled:
        account.payouts_enabled === true,
      error: '',
    };
  } catch {
    return {
      ...result,
      error: 'Stripe status check failed.',
    };
  }
}

export default async function TutorOnboarding() {
  const who = await identity();

  if (!who) {
    redirect('/login');
  }

  if (who.role !== 'TUTOR') {
    redirect('/dashboard');
  }

  const profile = await db.tutorProfile.findUnique({
    where: {
      userId: who.id,
    },
    include: {
      _count: {
        select: {
          availability: true,
        },
      },
    },
  });

  const approved =
    profile?.verification === 'APPROVED';

  const profileComplete = Boolean(
    profile &&
    profile.bio.trim().length >= 30 &&
    profile.qualifications.trim().length >= 10 &&
    profile.subjects.length > 0 &&
    profile.grades.length > 0 &&
    profile.cities.length > 0 &&
    profile.languages.length > 0 &&
    profile.hourlyRateCents >= 2000 &&
    profile.hourlyRateCents <= 30000
  );

  const availabilityComplete =
    (profile?._count.availability ?? 0) > 0;

  const stripe = approved
    ? await getStripeStatus(
        profile?.stripeAccountId
      )
    : {
        connected: false,
        paymentsEnabled: false,
        payoutsEnabled: false,
        error: '',
      };

  const stripeReady =
    stripe.paymentsEnabled &&
    stripe.payoutsEnabled;

  const steps: Step[] = [
    {
      title: 'Create your tutor profile',
      description:
        'Tell parents who you are and what you teach.',
      complete: Boolean(profile),
      detail: profile
        ? 'Profile submitted'
        : 'Complete the profile form below.',
    },
    {
      title: 'Complete your profile details',
      description:
        'Add your qualifications, subjects, grades, locations, languages and hourly rate.',
      complete: profileComplete,
      detail: profileComplete
        ? 'Profile information complete'
        : 'Review the profile form below.',
    },
    {
      title: 'Set your tutoring availability',
      description:
        'Choose the days and times when you can accept sessions.',
      complete: availabilityComplete,
      detail: availabilityComplete
        ? 'At least one availability period saved'
        : 'Add your available times below.',
    },
    {
      title: 'Receive administrator approval',
      description:
        'Your application must be reviewed before your profile can be approved.',
      complete: approved,
      detail:
        profile?.verification === 'REJECTED'
          ? 'Your application was not approved. Contact support for details.'
          : approved
          ? 'Approved'
          : profile
          ? 'Awaiting administrator review'
          : 'Submit your profile first.',
    },
    {
      title: 'Set up Stripe payments',
      description:
        'Complete payment onboarding so you can accept payments and receive payouts.',
      complete: stripeReady,
      detail: stripeReady
        ? 'Payments and payouts enabled'
        : !approved
        ? 'Available after administrator approval'
        : stripe.error
        ? stripe.error
        : stripe.connected
        ? 'Continue Stripe onboarding or verification'
        : 'Connect your Stripe account below.',
    },
  ];

  const completed = steps.filter(
    step => step.complete
  ).length;

  const percentage = Math.round(
    (completed / steps.length) * 100
  );

  return (
    <main>
      <p>
        <Link href="/dashboard">
          Back to dashboard
        </Link>
      </p>

      <h1>Become a Tutor</h1>

      <p className="muted">
        Complete these steps to prepare your
        Essex Tutor Connect account.
      </p>

      <section className="card">
        <h2>Your onboarding progress</h2>

        <p>
          <strong>
            {completed} of {steps.length} steps complete
          </strong>
        </p>

        <div
          role="progressbar"
          aria-valuenow={completed}
          aria-valuemin={0}
          aria-valuemax={steps.length}
          aria-label="Tutor onboarding progress"
          style={{
            height: 14,
            width: '100%',
            borderRadius: 10,
            background: '#e5e7eb',
            overflow: 'hidden',
            marginTop: 12,
          }}
        >
          <div
            style={{
              width: `${percentage}%`,
              height: '100%',
              background: '#167c64',
              borderRadius: 10,
            }}
          />
        </div>

        <p className="muted">
          {percentage}% complete
        </p>

        {completed === steps.length ? (
          <p>
            <strong>
              Your onboarding checklist is complete!
            </strong>
            {' '}
            Your account is prepared to receive
            tutoring inquiries and payments.
          </p>
        ) : (
          <p className="muted">
            Complete the remaining steps below.
            Some steps require administrator
            or Stripe approval.
          </p>
        )}
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>Onboarding checklist</h2>

        {steps.map((step, index) => (
          <div className="card" key={step.title}>
            <h3>
              {step.complete ? '✓' : '○'}
              {' '}
              Step {index + 1}: {step.title}
            </h3>

            <p>{step.description}</p>

            <p>
              <strong>
                {step.complete
                  ? 'Complete'
                  : 'Not yet complete'}
              </strong>
            </p>

            <p className="muted">
              {step.detail}
            </p>
          </div>
        ))}
      </section>

      <section style={{ marginTop: 28 }}>
        <h2>1. Your tutor profile</h2>

        <p className="muted">
          Complete your profile using your own
          qualifications and teaching experience.
          Changes may require administrator review.
        </p>

        <DashboardForm
          initialProfile={
            profile
              ? {
                  bio: profile.bio,
                  qualifications:
                    profile.qualifications,
                  subjects: profile.subjects,
                  grades: profile.grades,
                  cities: profile.cities,
                  languages: profile.languages,
                  hourlyRateCents:
                    profile.hourlyRateCents,
                  online: profile.online,
                }
              : null
          }
        />
      </section>

      {profile && (
        <section style={{ marginTop: 28 }}>
          <h2>2. Your availability</h2>

          <p className="muted">
            Add your regular tutoring hours.
            Keep them updated to avoid scheduling
            conflicts.
          </p>

          <AvailabilityManager />
        </section>
      )}

      {approved && (
        <section
          className="card"
          style={{ marginTop: 28 }}
        >
          <h2>3. Set up payments</h2>

          <p>
            <strong>
              Stripe account:
            </strong>
            {' '}
            {stripe.connected
              ? 'Linked'
              : 'Not connected'}
          </p>

          <p>
            <strong>
              Accepting payments:
            </strong>
            {' '}
            {stripe.paymentsEnabled
              ? 'Enabled'
              : 'Not yet enabled'}
          </p>

          <p>
            <strong>
              Bank payouts:
            </strong>
            {' '}
            {stripe.payoutsEnabled
              ? 'Enabled'
              : 'Not yet enabled'}
          </p>

          {stripe.error && (
            <p className="muted">
              {stripe.error}
            </p>
          )}

          <ConnectButton
            connected={stripe.connected}
            payoutsEnabled={stripe.payoutsEnabled}
          />

          <p className="muted">
            Essex Tutor Connect charges a
            15% platform commission on bookings.
            Stripe processing fees may also apply.
          </p>
        </section>
      )}

      <section
        className="card"
        style={{ marginTop: 28 }}
      >
        <h2>Next steps</h2>

        <p>
          Once your profile is approved and
          Stripe onboarding is complete,
          parents can contact you through
          Essex Tutor Connect.
        </p>

        <p>
          Remember to respond to inquiries,
          maintain accurate availability,
          and review booking requests.
        </p>

        <Link href="/dashboard">
          Return to your dashboard
        </Link>
      </section>
    </main>
  );
}
