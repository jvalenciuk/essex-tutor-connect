
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { identity } from '../../lib/security';
import { db } from '../../lib/db';

import InquiryActions from './inquiry-actions';
import InquiryMessages from './inquiry-messages';
import BookingManager from './booking-manager';
import SessionCalendar from './session-calendar';

export const dynamic = 'force-dynamic';

type StripeStatus = {
  connected: boolean;
  paymentsEnabled: boolean;
  payoutsEnabled: boolean;
  payoutsRestricted: boolean;
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
    payoutsRestricted: false,
  };

  if (!accountId) return empty;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    return { ...empty, connected: true, error: 'Stripe configuration unavailable.' };
  }

  try {
    const url = new URL(
      `https://api.stripe.com/v2/core/accounts/${encodeURIComponent(accountId)}`
    );
    url.searchParams.append('include[0]', 'configuration.merchant');

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${key}`,
        'Stripe-Version': '2026-10-28.endive',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      console.error('Stripe account status lookup failed', response.status, errorBody?.error?.message ?? errorBody?.error?.code ?? 'No Stripe error details');
      return { ...empty, connected: true, error: 'Unable to verify Stripe status.' };
    }

    const account = await response.json();
    const capabilities = account.configuration?.merchant?.capabilities;
    if (!capabilities) {
      return { ...empty, connected: true, error: 'Stripe capabilities unavailable.' };
    }

    const paymentStatus = capabilities.card_payments?.status;
    const payoutStatus = capabilities.stripe_balance?.payouts?.status;

    return {
      connected: true,
      paymentsEnabled: paymentStatus === 'active',
      payoutsEnabled: payoutStatus === 'active',
      payoutsRestricted: payoutStatus === 'restricted',
    };
  } catch (error) {
    console.error('Stripe account status check failed', error);
    return { ...empty, connected: true, error: 'Stripe status check failed.' };
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
    <div className="card" style={{ minWidth: 0, margin: 0 }}>
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
      {detail && <p className="muted">{detail}</p>}
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

  if (!who) redirect('/login');

  const isTutor = who.role === 'TUTOR';
  const isParent = who.role === 'PARENT';

  const profile = isTutor
    ? await db.tutorProfile.findUnique({
        where: { userId: who.id },
        include: {
          _count: {
            select: { availability: true },
          },
        },
      })
    : null;

  const approved = profile?.verification === 'APPROVED';

  const stripe = approved
    ? await getStripeStatus(profile?.stripeAccountId)
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
    stripe?.paymentsEnabled && stripe?.payoutsEnabled
  );

  const setupSteps = [
    Boolean(profile),
    profileComplete,
    availabilityComplete,
    approved,
    stripeReady,
  ];

  const completedSteps = setupSteps.filter(Boolean).length;
  const setupPercentage = Math.round(
    (completedSteps / setupSteps.length) * 100
  );

  const now = new Date();

  // Tutor booking records for the earnings summary.
  const tutorBookings =
    isTutor && profile
      ? await db.booking.findMany({
          where: {
            tutorId: profile.id,
            status: { in: ['PAID', 'COMPLETED'] },
          },
          include: {
            parent: { select: { name: true } },
            inquiry: {
              select: { subject: true, grade: true },
            },
          },
          orderBy: { startsAt: 'desc' },
        })
      : [];

  const upcomingTutorSessions = tutorBookings
    .filter(
      booking =>
        booking.status === 'PAID' && booking.startsAt > now
    )
    .sort(
      (a, b) =>
        a.startsAt.getTime() - b.startsAt.getTime()
    );

  const totalValue = tutorBookings.reduce(
    (sum, booking) => sum + booking.amountCents,
    0
  );

  const totalCommission = tutorBookings.reduce(
    (sum, booking) => sum + booking.platformFeeCents,
    0
  );

  const tutorEarnings = totalValue - totalCommission;

  // Parent bookings are always restricted to the signed-in parent.
  const parentBookings = isParent
    ? await db.booking.findMany({
        where: { parentId: who.id },
        include: {
          tutor: {
            include: {
              user: { select: { name: true } },
            },
          },
          inquiry: {
            select: { subject: true, grade: true },
          },
        },
        orderBy: { startsAt: 'asc' },
      })
    : [];

  const upcomingParentSessions = parentBookings.filter(
    booking =>
      booking.status === 'PAID' && booking.startsAt > now
  );

  const awaitingPayment = parentBookings.filter(
    booking =>
      booking.status === 'PENDING_PAYMENT' &&
      booking.startsAt > now
  );

  const paidParentBookings = parentBookings.filter(
    booking =>
      booking.status === 'PAID' ||
      booking.status === 'COMPLETED'
  );

  const totalParentSpending = paidParentBookings.reduce(
    (sum, booking) => sum + booking.amountCents,
    0
  );

  const inquiries =
    isTutor || isParent
      ? await db.inquiry.findMany({
          where: isTutor
            ? { tutor: { userId: who.id } }
            : { parentId: who.id },
          include: {
            parent: { select: { name: true } },
            tutor: {
              include: {
                user: { select: { name: true } },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 50,
        })
      : [];

  // Keep action items separate from the full booking history.
  const tutorActionBookings =
    isTutor && profile
      ? await db.booking.findMany({
          where: {
            tutorId: profile.id,
            status: { in: ['CHANGE_REQUESTED', 'PROPOSED', 'PENDING_PAYMENT'] },
            startsAt: { gte: now },
          },
          include: {
            parent: { select: { name: true } },
            inquiry: { select: { subject: true } },
          },
          orderBy: { startsAt: 'asc' },
        })
      : [];

  const tutorNeedsResponse = tutorActionBookings.filter(
    booking => booking.status === 'CHANGE_REQUESTED'
  );
  const tutorWaitingForPayment = tutorActionBookings.filter(
    booking => booking.status === 'PENDING_PAYMENT'
  );

  const openInquiries = inquiries.filter(
    inquiry => inquiry.status === 'OPEN'
  ).length;

  const activeParentInquiries = inquiries.filter(
    inquiry =>
      inquiry.status === 'OPEN' ||
      inquiry.status === 'ACCEPTED'
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

      <p className="muted">Account type: {who.role}</p>

      {who.role === 'ADMIN' && (
        <section className="card">
          <h2>Administrator Tools</h2>
          <p>
            Manage tutor approvals, bookings, and payment
            reconciliation.
          </p>
          <SectionLink href="/admin">
            Open Administrator Dashboard
          </SectionLink>
        </section>
      )}

      {isTutor && (
        <>
          <section style={{ marginTop: 24 }}>
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
                value={upcomingTutorSessions.length}
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

          <details className="card" style={{ marginTop: 24 }}>
            <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: "1.1rem" }}>Account setup · {completedSteps} of 5 steps complete{stripe?.payoutsRestricted ? " · Payouts restricted" : ""}</summary>

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
              Verification:{' '}
              {profile?.verification || 'Profile not submitted'}
            </p>

            <p>
              <strong>Stripe connection:</strong>{' '}
              {!approved
                ? 'Available after approval'
                : !stripe?.connected
                ? 'Not connected'
                : 'Connected'}
            </p>

            {approved && stripe?.connected && (
              <>
                <p>
                  <strong>Card payments:</strong>{' '}
                  {stripe.error
                    ? 'Status unavailable'
                    : stripe.paymentsEnabled
                    ? 'Active'
                    : 'Not active'}
                </p>
                <p>
                  <strong>Bank payouts:</strong>{' '}
                  {stripe.error
                    ? 'Status unavailable'
                    : stripe.payoutsEnabled
                    ? 'Active'
                    : stripe.payoutsRestricted
                    ? 'Restricted — verification required'
                    : 'Not active'}
                </p>
                {stripe.payoutsRestricted && !stripe.error && (
                  <p className="muted">
                    Stripe has restricted payouts. Complete any outstanding
                    identity or account verification requirements in Stripe
                    before expecting bank payouts. Payments received are not
                    the same as funds available to withdraw.
                  </p>
                )}
              </>
            )}

            {stripe?.error && (
              <p className="muted">{stripe.error}</p>
            )}

            <p className="muted">
              Edit your profile, set availability, and
              complete Stripe onboarding on the Tutor Setup page.
            </p>

            <SectionLink href="/dashboard/onboarding">
              {completedSteps === 5
                ? 'Manage Tutor Account'
                : 'Complete Tutor Setup'}
            </SectionLink>
          </details>

          <section className="card" style={{ marginTop: 24 }}>
            <h2>Upcoming Sessions</h2>

            {upcomingTutorSessions.length === 0 ? (
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
                      <th style={{ padding: 10 }}>Date</th>
                      <th style={{ padding: 10 }}>Parent</th>
                      <th style={{ padding: 10 }}>Subject</th>
                      <th style={{ padding: 10 }}>Duration</th>
                      <th style={{ padding: 10 }}>Earnings</th>
                    </tr>
                  </thead>
                  <tbody>
                    {upcomingTutorSessions.map(booking => (
                      <tr key={booking.id}>
                        <td style={{ padding: 10 }}>
                          {sessionDate(booking.startsAt)}
                        </td>
                        <td style={{ padding: 10 }}>
                          {booking.parent.name}
                        </td>
                        <td style={{ padding: 10 }}>
                          {booking.inquiry?.subject || 'Tutoring'}
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

          <details className="card" style={{ marginTop: 24 }}>
            <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: "1.1rem" }}>Earnings breakdown · {money(tutorEarnings)}</summary>

            <p>
              <strong>Total booking value:</strong>{' '}
              {money(totalValue)}
            </p>
            <p>
              <strong>Platform commission:</strong>{' '}
              {money(totalCommission)}
            </p>
            <p>
              <strong>Your earnings:</strong>{' '}
              {money(tutorEarnings)}
            </p>
            <p>
              <strong>Paid and completed sessions:</strong>{' '}
              {tutorBookings.length}
            </p>
            <p className="muted">
              Figures include paid and completed bookings
              and exclude refunded bookings. Earnings are
              estimates before Stripe fees, disputes, and
              other adjustments. They are not confirmed
              bank payouts.
            </p>
          </details>
        </>
      )}

      {isParent && (
        <>
          <section style={{ marginTop: 24 }}>
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
                label="Upcoming Sessions"
                value={upcomingParentSessions.length}
              />
              <StatCard
                label="Awaiting Payment"
                value={awaitingPayment.length}
              />
              <StatCard
                label="Active Inquiries"
                value={activeParentInquiries}
              />
              <StatCard
                label="Total Paid Bookings"
                value={money(totalParentSpending)}
                detail={`${paidParentBookings.length} paid or completed sessions; excludes refunds`}
              />
            </div>
          </section>

          <section className="card" style={{ marginTop: 24 }}>
            <h2>Find a Tutor</h2>
            <p>
              Search for approved tutors, send inquiries,
              and arrange your next tutoring session.
            </p>
            <SectionLink href="/tutors">
              Find Tutors
            </SectionLink>
          </section>

          <section className="card" style={{ marginTop: 24 }}>
            <h2>Upcoming Sessions</h2>

            {upcomingParentSessions.length === 0 ? (
              <p>You have no upcoming paid sessions.</p>
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
                      <th style={{ padding: 10 }}>Date</th>
                      <th style={{ padding: 10 }}>Tutor</th>
                      <th style={{ padding: 10 }}>Subject</th>
                      <th style={{ padding: 10 }}>Duration</th>
                      <th style={{ padding: 10 }}>Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {upcomingParentSessions.map(booking => (
                      <tr key={booking.id}>
                        <td style={{ padding: 10 }}>
                          {sessionDate(booking.startsAt)}
                        </td>
                        <td style={{ padding: 10 }}>
                          {booking.tutor.user.name}
                        </td>
                        <td style={{ padding: 10 }}>
                          {booking.inquiry?.subject || 'Tutoring'}
                        </td>
                        <td style={{ padding: 10 }}>
                          {booking.durationMinutes} min
                        </td>
                        <td style={{ padding: 10 }}>
                          {money(booking.amountCents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="card" style={{ marginTop: 24 }}>
            <h2>Payments Awaiting Action</h2>

            {awaitingPayment.length === 0 ? (
              <p>No payments are currently awaiting action.</p>
            ) : (
              <>
                <p className="muted">
                  Your tutor has accepted these bookings.
                  Complete payment through the booking
                  manager below to confirm your session.
                </p>

                {awaitingPayment.map(booking => (
                  <div
                    key={booking.id}
                    style={{
                      padding: '14px 0',
                      borderBottom: '1px solid #e5e7eb',
                    }}
                  >
                    <p>
                      <strong>
                        {booking.inquiry?.subject || 'Tutoring'}
                      </strong>{' '}
                      with {booking.tutor.user.name}
                    </p>
                    <p>
                      {sessionDate(booking.startsAt)} —{' '}
                      {money(booking.amountCents)}
                    </p>
                    <p className="muted">
                      Open the corresponding accepted
                      inquiry under Bookings &amp; Messages
                      to pay securely.
                    </p>
                  </div>
                ))}
              </>
            )}
          </section>
        </>
      )}

      {isTutor && (
        <section className="card" style={{ marginTop: 24 }}>
          <h2>Needs Your Attention</h2>
          <p className="muted">
            Respond to scheduling requests below. Open the matching conversation
            in Bookings &amp; Messages to accept or suggest a new time.
          </p>
          {tutorNeedsResponse.length === 0 ? (
            <p>No scheduling requests need a response right now.</p>
          ) : (
            tutorNeedsResponse.map(booking => (
              <p key={booking.id}>
                <strong>{booking.parent.name}</strong> · {booking.inquiry?.subject || 'Tutoring'}
                {' — '}requested a time change for {sessionDate(booking.startsAt)}
              </p>
            ))
          )}
          <details style={{ marginTop: 16 }}>
            <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
              Waiting for parent payment ({tutorWaitingForPayment.length})
            </summary>
            {tutorWaitingForPayment.length === 0 ? (
              <p className="muted">No payments pending.</p>
            ) : tutorWaitingForPayment.map(booking => (
              <p key={booking.id}>
                {booking.parent.name} · {sessionDate(booking.startsAt)} · {money(booking.amountCents)}
              </p>
            ))}
          </details>
        </section>
      )}

      {(isTutor || isParent) && (
        <section className="card" style={{ marginTop: 28 }}>
          {isTutor && <p className="muted">Awaiting-payment sessions reserve their times. Proposed sessions are requests, not confirmed availability.</p>}
          <SessionCalendar role={who.role} />

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
            <details
              className="card"
              id={`inquiry-${inquiry.id}`}
              key={inquiry.id}
              
              style={{ marginBottom: 16 }}
            >
              <summary style={{ cursor: 'pointer', fontWeight: 700, padding: '8px 0', fontSize: '1.05rem' }}>
                {inquiry.subject} — {inquiry.grade} · {isTutor ? inquiry.parent.name : inquiry.tutor.user.name} · {inquiry.status}
              </summary>
              <div style={{ marginTop: 12 }}>
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
                  <InquiryMessages inquiryId={inquiry.id} />
                  <BookingManager
                    inquiryId={inquiry.id}
                    role={who.role}
                  />
                </>
              )}
              </div>
            </details>
          ))}
        </section>
      )}
    </main>
  );
}
