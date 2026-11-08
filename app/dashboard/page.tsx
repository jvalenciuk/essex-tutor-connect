
import { identity } from '../../lib/security';
import { db } from '../../lib/db';
import { redirect } from 'next/navigation';

import DashboardForm from './profile-form';
import ConnectButton from './connect-button';
import InquiryActions from './inquiry-actions';
import InquiryMessages from './inquiry-messages';
import BookingManager from './booking-manager';

export const dynamic = 'force-dynamic';

type StripeAccountStatus = {
  connected: boolean;
  paymentsEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  requirements: string[];
  error?: string;
};

async function getStripeAccountStatus(
  accountId: string | null | undefined
): Promise<StripeAccountStatus> {
  const emptyStatus: StripeAccountStatus = {
    connected: false,
    paymentsEnabled: false,
    payoutsEnabled: false,
    detailsSubmitted: false,
    requirements: [],
  };

  if (!accountId) {
    return emptyStatus;
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    return {
      ...emptyStatus,
      connected: true,
      error: 'Stripe configuration is unavailable.',
    };
  }

  try {
    const response = await fetch(
      `https://api.stripe.com/v1/accounts/${encodeURIComponent(accountId)}`,
      {
        headers: {
          Authorization: `Bearer ${secretKey}`,
        },
        cache: 'no-store',
      }
    );

    if (!response.ok) {
      console.error(
        'Unable to retrieve Stripe account status',
        response.status
      );

      return {
        ...emptyStatus,
        connected: true,
        error: 'Stripe account status is temporarily unavailable.',
      };
    }

    const account = await response.json();

    return {
      connected: true,
      paymentsEnabled: account.charges_enabled === true,
      payoutsEnabled: account.payouts_enabled === true,
      detailsSubmitted: account.details_submitted === true,
      requirements: Array.isArray(account.requirements?.currently_due)
        ? account.requirements.currently_due
        : [],
    };
  } catch (error) {
    console.error('Stripe status request failed', error);

    return {
      ...emptyStatus,
      connected: true,
      error: 'Unable to check Stripe account status.',
    };
  }
}

function PaymentStatus({
  status,
}: {
  status: StripeAccountStatus;
}) {
  if (!status.connected) {
    return (
      <p>
        <strong>Stripe status:</strong> Not connected
      </p>
    );
  }

  if (status.error) {
    return (
      <p>
        <strong>Stripe status:</strong> {status.error}
      </p>
    );
  }

  return (
    <>
      <p>
        <strong>Stripe connection:</strong> Connected
      </p>

      <p>
        <strong>Accepting payments:</strong>{' '}
        {status.paymentsEnabled
          ? 'Enabled'
          : 'Not yet enabled'}
      </p>

      <p>
        <strong>Bank payouts:</strong>{' '}
        {status.payoutsEnabled
          ? 'Enabled'
          : 'Restricted or pending verification'}
      </p>

      {!status.detailsSubmitted && (
        <p className="muted">
          Stripe onboarding is not yet complete.
        </p>
      )}

      {status.requirements.length > 0 && (
        <p className="muted">
          Stripe requires additional account information.
          Use the button below to continue onboarding.
        </p>
      )}

      {status.paymentsEnabled && status.payoutsEnabled && (
        <p>
          Your Stripe account is ready to accept payments
          and receive payouts.
        </p>
      )}
    </>
  );
}

export default async function Dashboard() {
  const who = await identity();

  if (!who) {
    redirect('/login');
  }

  const profile =
    who.role === 'TUTOR'
      ? await db.tutorProfile.findUnique({
          where: { userId: who.id },
        })
      : null;

  const stripeStatus =
    who.role === 'TUTOR' &&
    profile?.verification === 'APPROVED'
      ? await getStripeAccountStatus(profile.stripeAccountId)
      : null;

  const inquiries = await db.inquiry.findMany({
    where:
      who.role === 'TUTOR'
        ? { tutor: { userId: who.id } }
        : { parentId: who.id },
    include: {
      parent: {
        select: { name: true },
      },
      tutor: {
        include: {
          user: {
            select: { name: true },
          },
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 50,
  });

  return (
    <main>
      <h1>Dashboard</h1>

      <p>Account type: {who.role}</p>

      {who.role === 'TUTOR' && (
        <>
          <p>
            Verification:{' '}
            {profile?.verification || 'Profile not submitted'}
          </p>

          <DashboardForm
            initialProfile={
              profile
                ? {
                    bio: profile.bio,
                    qualifications: profile.qualifications,
                    subjects: profile.subjects,
                    grades: profile.grades,
                    cities: profile.cities,
                    languages: profile.languages,
                    hourlyRateCents: profile.hourlyRateCents,
                    online: profile.online,
                  }
                : null
            }
          />

          {profile?.verification === 'APPROVED' && (
            <div className="card">
              <h2>Receive payments</h2>

              {stripeStatus && (
                <PaymentStatus status={stripeStatus} />
              )}

              <ConnectButton />
            </div>
          )}
        </>
      )}

      {who.role === 'PARENT' && (
        <p>
          Browse approved tutors and send inquiries
          through their profiles.
        </p>
      )}

      <h2>Inquiries</h2>

      {inquiries.length === 0 && (
        <p>No inquiries yet.</p>
      )}

      {inquiries.map((inquiry) => (
        <div className="card" key={inquiry.id}>
          <h3>
            {inquiry.subject} — {inquiry.grade}
          </h3>

          <p>{inquiry.message}</p>

          {who.role === 'TUTOR' ? (
            <>
              <p>From: {inquiry.parent.name}</p>

              <InquiryActions
                inquiryId={inquiry.id}
                status={inquiry.status}
              />
            </>
          ) : (
            <>
              <p>Tutor: {inquiry.tutor.user.name}</p>

              <p className="muted">
                Status: {inquiry.status}
              </p>
            </>
          )}

          {inquiry.status === 'ACCEPTED' && (
            <>
              <InquiryMessages inquiryId={inquiry.id} />

              <BookingManager
                inquiryId={inquiry.id}
                role={who.role}
              />
            </>
          )}
        </div>
      ))}
    </main>
  );
}
