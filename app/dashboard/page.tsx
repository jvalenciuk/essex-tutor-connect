
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { identity } from '../../lib/security';
import { db } from '../../lib/db';

import InquiryActions from './inquiry-actions';
import InquiryMessages from './inquiry-messages';
import BookingManager from './booking-manager';

export const dynamic = 'force-dynamic';

type StripeStatus = {
  connected: boolean;
  paymentsEnabled: boolean;
  payoutsEnabled: boolean;
  error?: string;
};

function money(cents: number): string {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
  }).format(cents / 100);
}

function sessionDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Toronto',
  }).format(date);
}

async function getStripeStatus(
  accountId: string | null | undefined
): Promise<StripeStatus> {
  const empty: StripeStatus = {
    connected: false,
    paymentsEnabled: false,
    payoutsEnabled: false,
  };

  if (!accountId) return empty;

  const key = process.env.STRIPE_SECRET_KEY;

  if (!key) {
    return {
      ...empty,
      connected: true,
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
        ...empty,
        connected: true,
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
    };
  } catch {
    return {
      ...empty,
      connected: true,
      error: 'Stripe status check failed.',
    };
  }
}

function StatCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail?: string;
}) {
  return (
    <div
      className="card"
      style={{
        minWidth: 0,
        margin: 0,
      }}
    >
      <p className="muted">{label}</p>

      <p
        style={{
          fontSize: '1.65rem',
          fontWeight: 700,
          margin: '10px 0',
          overflowWrap: 'anywhere',
        }}
      >
        {value}
      </p>

      {detail && (
        <p className="muted">{detail}</p>
      )}
    </div>
  );
}

function SectionLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      style={{
        display: 'inline-block',
        background: '#123b61',
        color: '#fff',
        padding: '12px 18px',
        borderRadius: 8,
        fontWeight: 600,
        textDecoration: 'none',
      }}
    >
      {children}
    </Link>
  );
}

export default async function Dashboard() {
  const who = await identity();

  if (!who) {
    redirect('/login');
  }

  const isTutor = who.role === 'TUTOR';
  const isParent = who.role === 'PARENT';

  const profile = isTutor
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

  const approved =
    profile?.verification === 'APPROVED';

  const stripe = approved
    ? await getStripeStatus(
        profile?.stripeAccountId
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

  const stripeReady = Boolean(
    stripe?.paymentsEnabled &&
      stripe?.payoutsEnabled
  );

  const setupSteps = [
    Boolean(profile),
    profileComplete,
    availabilityComplete,
    approved,
    stripeReady,
  ];

  const completedSteps =
    setupSteps.filter(Boolean).length;

  const setupPercentage =
    Math.round(
      (completedSteps / setupSteps.length) * 100
    );

  const now = new Date();

  const bookings = isTutor && profile
    ? await db.booking.findMany({
        where: {
          tutorId: profile.id,
          status: {
            in: ['PAID', 'COMPLETED'],
          },
        },
        include: {
          parent: {
            select: { name: true },
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

  const upcoming = bookings
    .filter(
      booking =>
        booking.status === 'PAID' &&
        booking.startsAt > now
    )
    .sort(
      (a, b) =>
        a.startsAt.getTime() -
        b.startsAt.getTime()
    );

  const totalValue = bookings.reduce(
    (sum, booking) =>
      sum + booking.amountCents,
    0
  );

  const totalCommission = bookings.reduce(
    (sum, booking) =>
      sum + booking.platformFeeCents,
    0
  );

  const tutorEarnings =
    totalValue - totalCommission;

  const inquiries = isTutor || isParent
    ? await db.inquiry.findMany({
        where: isTutor
          ? {
              tutor: {
                userId: who.id,
              },
            }
          : {
              parentId: who.id,
            },
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
      })
    : [];

  const openInquiries = inquiries.filter(
    inquiry => inquiry.status === 'OPEN'
  ).length;

  return (
    <main>
      <h1>
        {isTutor
          ? 'Tutor Dashboard'
          : isParent
          ? 'Parent Dashboard'
          : 'Dashboard'}
      </h1>

      <p className="muted">
        Account type: {who.role}
      </p>

      {who.role === 'ADMIN' && (
        <section className="card">
          <h2>Administrator Tools</h2>

          <p>
            Manage tutor approvals, bookings,
            and payment reconciliation.
          </p>

          <SectionLink href="/admin">
            Open Administrator Dashboard
          </SectionLink>
        </section>
      )}

      {isTutor && (
        <>
          <section
            style={{ marginTop: 24 }}
          >
            <h2>Overview</h2>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns:
                  'repeat(auto-fit, minmax(190px, 1fr))',
                gap: 14,
              }}
            >
              <StatCard
                label="Upcoming Paid Sessions"
                value={upcoming.length}
              />

              <StatCard
                label="Tutor Earnings"
                value={money(tutorEarnings)}
                detail="Before Stripe fees and adjustments"
              />

              <StatCard
                label="Open Inquiries"
                value={openInquiries}
              />

              <StatCard
                label="Tutor Setup"
                value={`${setupPercentage}%`}
                detail={`${completedSteps} of 5 steps complete`}
              />
            </div>
          </section>

          <section
            className="card"
            style={{ marginTop: 24 }}
          >
            <h2>Account Setup</h2>

            <p>
              <strong>
                {completedSteps} of 5 steps complete
              </strong>
            </p>

            <div
              role="progressbar"
              aria-label="Tutor onboarding progress"
              aria-valuemin={0}
              aria-valuemax={5}
              aria-valuenow={completedSteps}
              style={{
                width: '100%',
                height: 14,
                background: '#e5e7eb',
                borderRadius: 10,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${setupPercentage}%`,
                  height: '100%',
                  background: '#167c64',
                  borderRadius: 10,
                }}
              />
            </div>

            <p className="muted">
              Verification: {
                profile?.verification ||
                'Profile not submitted'
              }
            </p>

            <p>
              Stripe payments: {
                !approved
                  ? 'Available after approval'
                  : stripe?.error
                  ? 'Status unavailable'
                  : stripeReady
                  ? 'Ready'
                  : 'Setup incomplete'
              }
            </p>

            {stripe?.error && (
              <p className="muted">
                {stripe.error}
              </p>
            )}

            <p className="muted">
              Edit your profile, set your availability,
              and finish Stripe onboarding on the
              Tutor Setup page.
            </p>

            <SectionLink href="/dashboard/onboarding">
              {completedSteps === 5
                ? 'Manage Tutor Account'
                : 'Complete Tutor Setup'}
            </SectionLink>
          </section>

          <section
            className="card"
            style={{ marginTop: 24 }}
          >
            <h2>Upcoming Sessions</h2>

            {upcoming.length === 0 ? (
              <p>
                No upcoming paid sessions.
              </p>
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
                        Earnings
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {upcoming.map(booking => (
                      <tr key={booking.id}>
                        <td style={{ padding: 10 }}>
                          {sessionDate(
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
                          {money(
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

          <section
            className="card"
            style={{ marginTop: 24 }}
          >
            <h2>Earnings Summary</h2>

            <p>
              <strong>
                Total booking value:
              </strong>{' '}
              {money(totalValue)}
            </p>

            <p>
              <strong>
                Platform commission:
              </strong>{' '}
              {money(totalCommission)}
            </p>

            <p>
              <strong>
                Your earnings:
              </strong>{' '}
              {money(tutorEarnings)}
            </p>

            <p>
              <strong>
                Paid and completed sessions:
              </strong>{' '}
              {bookings.length}
            </p>

            <p className="muted">
              Figures include paid and completed
              bookings and exclude refunded bookings.
              Earnings are estimates before Stripe
              fees, disputes, and other adjustments.
              They are not confirmed bank payouts.
            </p>
          </section>
        </>
      )}

      {isParent && (
        <section className="card">
          <h2>Find a Tutor</h2>

          <p>
            Search for approved tutors, send
            inquiries, and manage your bookings.
          </p>

          <SectionLink href="/tutors">
            Find Tutors
          </SectionLink>
        </section>
      )}

      {(isTutor || isParent) && (
        <section style={{ marginTop: 28 }}>
          <h2>Bookings &amp; Messages</h2>

          <p className="muted">
            Manage tutoring inquiries, conversations,
            session proposals, and booking updates.
          </p>

          {inquiries.length === 0 && (
            <div className="card">
              <p>No inquiries yet.</p>
            </div>
          )}

          {inquiries.map(inquiry => (
            <div
              className="card"
              key={inquiry.id}
            >
              <h3>
                {inquiry.subject} — {inquiry.grade}
              </h3>

              <p>{inquiry.message}</p>

              {isTutor ? (
                <>
                  <p>
                    <strong>From:</strong>{' '}
                    {inquiry.parent.name}
                  </p>

                  <InquiryActions
                    inquiryId={inquiry.id}
                    status={inquiry.status}
                  />
                </>
              ) : (
                <>
                  <p>
                    <strong>Tutor:</strong>{' '}
                    {inquiry.tutor.user.name}
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
        </section>
      )}
    </main>
  );
}
