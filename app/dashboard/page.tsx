
import Link from 'next/link';
import { identity } from '../../lib/security';
import { db } from '../../lib/db';
import { redirect } from 'next/navigation';

import DashboardForm from './profile-form';
import ConnectButton from './connect-button';
import InquiryActions from './inquiry-actions';
import InquiryMessages from './inquiry-messages';
import BookingManager from './booking-manager';
import AvailabilityManager from './availability-manager';

export const dynamic = 'force-dynamic';

type StripeAccountStatus = {
  connected: boolean;
  paymentsEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  requirements: string[];
  error?: string;
};

type EarningsBooking = {
  id: string;
  startsAt: Date;
  durationMinutes: number;
  amountCents: number;
  platformFeeCents: number;
  status: string;
  parent: {
    name: string;
  };
  inquiry: {
    subject: string;
    grade: string;
  } | null;
};

function formatCAD(cents: number): string {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
  }).format(cents / 100);
}

function formatSessionDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Toronto',
  }).format(date);
}

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
      `https://api.stripe.com/v1/accounts/${encodeURIComponent(
        accountId
      )}`,
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
        error:
          'Stripe account status is temporarily unavailable.',
      };
    }

    const account = await response.json();

    return {
      connected: true,
      paymentsEnabled:
        account.charges_enabled === true,
      payoutsEnabled:
        account.payouts_enabled === true,
      detailsSubmitted:
        account.details_submitted === true,
      requirements: Array.isArray(
        account.requirements?.currently_due
      )
        ? account.requirements.currently_due
        : [],
    };
  } catch (error) {
    console.error(
      'Stripe status request failed',
      error
    );

    return {
      ...emptyStatus,
      connected: true,
      error:
        'Unable to check Stripe account status.',
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
          Stripe requires additional account
          information. Use the button below
          to continue onboarding.
        </p>
      )}

      {status.paymentsEnabled &&
        status.payoutsEnabled && (
          <p>
            Your Stripe account is ready to accept
            payments and receive payouts.
          </p>
        )}
    </>
  );
}

function TutorSetup({
  profileExists,
  profileComplete,
  availabilityComplete,
  approved,
  stripeReady,
}: {
  profileExists: boolean;
  profileComplete: boolean;
  availabilityComplete: boolean;
  approved: boolean;
  stripeReady: boolean;
}) {
  const steps = [
    {
      name: 'Create tutor profile',
      complete: profileExists,
    },
    {
      name: 'Complete profile information',
      complete: profileComplete,
    },
    {
      name: 'Set tutoring availability',
      complete: availabilityComplete,
    },
    {
      name: 'Administrator approval',
      complete: approved,
    },
    {
      name: 'Complete Stripe setup',
      complete: stripeReady,
    },
  ];

  const completed = steps.filter(
    step => step.complete
  ).length;

  const percentage = Math.round(
    (completed / steps.length) * 100
  );

  return (
    <section className="card">
      <h2>Tutor Setup</h2>

      <p className="muted">
        Track your progress toward becoming
        ready to accept paid tutoring bookings.
      </p>

      <p>
        <strong>
          {completed} of {steps.length} steps complete
        </strong>
      </p>

      <div
        role="progressbar"
        aria-label="Tutor onboarding progress"
        aria-valuemin={0}
        aria-valuemax={steps.length}
        aria-valuenow={completed}
        style={{
          width: '100%',
          height: 14,
          background: '#e5e7eb',
          borderRadius: 10,
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

      <div style={{ marginTop: 16 }}>
        {steps.map(step => (
          <p key={step.name}>
            <span
              aria-hidden="true"
              style={{
                color: step.complete
                  ? '#167c64'
                  : '#64748b',
                fontWeight: 'bold',
              }}
            >
              {step.complete ? '✓' : '○'}
            </span>
            {' '}
            {step.name}
          </p>
        ))}
      </div>

      {completed === steps.length ? (
        <p>
          <strong>
            Your onboarding checklist is complete!
          </strong>
        </p>
      ) : (
        <p className="muted">
          Complete the remaining steps to prepare
          your tutor account.
        </p>
      )}

      <p style={{ marginTop: 20 }}>
        <Link
          href="/dashboard/onboarding"
          style={{
            display: 'inline-block',
            padding: '12px 18px',
            borderRadius: 8,
            background: '#123b61',
            color: '#ffffff',
            textDecoration: 'none',
            fontWeight: 600,
          }}
        >
          {completed === steps.length
            ? 'Review Tutor Setup'
            : 'Complete Your Tutor Setup'}
        </Link>
      </p>
    </section>
  );
}

function TutorEarnings({
  bookings,
}: {
  bookings: EarningsBooking[];
}) {
  const totalPaidCents = bookings.reduce(
    (total, booking) =>
      total + booking.amountCents,
    0
  );

  const totalCommissionCents = bookings.reduce(
    (total, booking) =>
      total + booking.platformFeeCents,
    0
  );

  const tutorEarningsCents =
    totalPaidCents - totalCommissionCents;

  const upcomingBookings = bookings
    .filter(
      booking =>
        booking.startsAt.getTime() > Date.now()
    )
    .sort(
      (a, b) =>
        a.startsAt.getTime() -
        b.startsAt.getTime()
    );

  return (
    <section className="card">
      <h2>Tutor Earnings</h2>

      <p className="muted">
        Earnings from paid tutoring bookings.
        All amounts are in Canadian dollars.
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 16,
          marginTop: 20,
          marginBottom: 20,
        }}
      >
        <div className="card">
          <h3>Total Paid Bookings</h3>
          <p
            style={{
              fontSize: '1.5rem',
              fontWeight: 'bold',
            }}
          >
            {formatCAD(totalPaidCents)}
          </p>
        </div>

        <div className="card">
          <h3>Platform Commission</h3>
          <p
            style={{
              fontSize: '1.5rem',
              fontWeight: 'bold',
            }}
          >
            {formatCAD(totalCommissionCents)}
          </p>
        </div>

        <div className="card">
          <h3>Your Earnings</h3>
          <p
            style={{
              fontSize: '1.5rem',
              fontWeight: 'bold',
            }}
          >
            {formatCAD(tutorEarningsCents)}
          </p>
        </div>

        <div className="card">
          <h3>Paid Sessions</h3>
          <p
            style={{
              fontSize: '1.5rem',
              fontWeight: 'bold',
            }}
          >
            {bookings.length}
          </p>
        </div>
      </div>

      <p className="muted">
        Your earnings are calculated after the
        platform commission but before Stripe
        processing fees, refunds, disputes, or
        other adjustments. These figures do not
        represent money deposited into your bank.
      </p>

      <h3>Upcoming Paid Sessions</h3>

      {upcomingBookings.length === 0 ? (
        <p>No upcoming paid sessions.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              textAlign: 'left',
            }}
          >
            <thead>
              <tr>
                <th style={{ padding: 10 }}>
                  Date
                </th>
                <th style={{ padding: 10 }}>
                  Parent
                </th>
                <th style={{ padding: 10 }}>
                  Subject
                </th>
                <th style={{ padding: 10 }}>
                  Duration
                </th>
                <th style={{ padding: 10 }}>
                  Your Earnings
                </th>
              </tr>
            </thead>

            <tbody>
              {upcomingBookings.map(booking => (
                <tr key={booking.id}>
                  <td style={{ padding: 10 }}>
                    {formatSessionDate(
                      booking.startsAt
                    )}
                  </td>

                  <td style={{ padding: 10 }}>
                    {booking.parent.name}
                  </td>

                  <td style={{ padding: 10 }}>
                    {booking.inquiry?.subject ||
                      'Tutoring'}
                  </td>

                  <td style={{ padding: 10 }}>
                    {booking.durationMinutes} min
                  </td>

                  <td style={{ padding: 10 }}>
                    {formatCAD(
                      booking.amountCents -
                        booking.platformFeeCents
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
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
          include: {
            _count: {
              select: {
                availability: true,
              },
            },
          },
        })
      : null;

  const stripeStatus =
    who.role === 'TUTOR' &&
    profile?.verification === 'APPROVED'
      ? await getStripeAccountStatus(
          profile.stripeAccountId
        )
      : null;

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

  const approved =
    profile?.verification === 'APPROVED';

  const stripeReady = Boolean(
    stripeStatus?.paymentsEnabled &&
      stripeStatus?.payoutsEnabled
  );

  const earningsBookings =
    who.role === 'TUTOR' && profile
      ? await db.booking.findMany({
          where: {
            tutorId: profile.id,
            status: {
              in: ['PAID', 'COMPLETED'],
            },
          },
          select: {
            id: true,
            startsAt: true,
            durationMinutes: true,
            amountCents: true,
            platformFeeCents: true,
            status: true,
            parent: {
              select: {
                name: true,
              },
            },
            inquiry: {
              select: {
                subject: true,
                grade: true,
              },
            },
          },
          orderBy: {
            startsAt: 'desc',
          },
        })
      : [];

  const inquiries = await db.inquiry.findMany({
    where:
      who.role === 'TUTOR'
        ? { tutor: { userId: who.id } }
        : { parentId: who.id },
    include: {
      parent: {
        select: {
          name: true,
        },
      },
      tutor: {
        include: {
          user: {
            select: {
              name: true,
            },
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
          <TutorSetup
            profileExists={Boolean(profile)}
            profileComplete={profileComplete}
            availabilityComplete={
              availabilityComplete
            }
            approved={approved}
            stripeReady={stripeReady}
          />

          <p>
            Verification:{' '}
            {profile?.verification ||
              'Profile not submitted'}
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

          {profile && <AvailabilityManager />}

          {profile?.verification === 'APPROVED' && (
            <>
              <div className="card">
                <h2>Receive payments</h2>

                {stripeStatus && (
                  <PaymentStatus
                    status={stripeStatus}
                  />
                )}

                <ConnectButton
                  connected={
                    stripeStatus?.connected ?? false
                  }
                  payoutsEnabled={
                    stripeStatus?.payoutsEnabled ??
                    false
                  }
                />
              </div>

              <TutorEarnings
                bookings={earningsBookings}
              />
            </>
          )}
        </>
      )}

      {who.role === 'PARENT' && (
        <p>
          Browse approved tutors and send inquiries
          through their profiles.
        </p>
      )}

      {who.role === 'ADMIN' && (
        <p>
          <Link href="/admin">
            Open Administrator Dashboard
          </Link>
        </p>
      )}

      <h2>Inquiries</h2>

      {inquiries.length === 0 && (
        <p>No inquiries yet.</p>
      )}

      {inquiries.map(inquiry => (
        <div className="card" key={inquiry.id}>
          <h3>
            {inquiry.subject} — {inquiry.grade}
          </h3>

          <p>{inquiry.message}</p>

          {who.role === 'TUTOR' ? (
            <>
              <p>
                From: {inquiry.parent.name}
              </p>

              <InquiryActions
                inquiryId={inquiry.id}
                status={inquiry.status}
              />
            </>
          ) : (
            <>
              <p>
                Tutor: {inquiry.tutor.user.name}
              </p>

              <p className="muted">
                Status: {inquiry.status}
              </p>
            </>
          )}

          {inquiry.status === 'ACCEPTED' && (
            <>
              <InquiryMessages
                inquiryId={inquiry.id}
              />

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
