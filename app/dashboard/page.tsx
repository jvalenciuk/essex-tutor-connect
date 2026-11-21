import { getActiveTutorStripeAccountId, getConfiguredStripeOnboardingSecret } from '../../lib/stripe-config';

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { identity } from '../../lib/security';
import { db } from '../../lib/db';

import InquiryActions from './inquiry-actions';
import InquiryMessages from './inquiry-messages';
import MessagePartnerButton from './message-partner-button';
import BookingManager from './booking-manager';
import SessionCalendar from './session-calendar';
import BookingJump from './booking-jump';
import DirectPaymentButton from './direct-payment-button';
import ConversationDeepLink from './conversation-deep-link';

export const dynamic = 'force-dynamic';

type StripeStatus = {
  connected: boolean;
  paymentsEnabled: boolean;
  payoutsEnabled: boolean;
  payoutsRestricted: boolean;
  transfersStatus: string;
  transfersDetail?: string;
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
    transfersStatus: 'Unavailable',
  };

  if (!accountId) return empty;

  const key = getConfiguredStripeOnboardingSecret();
  if (!key) {
    return { ...empty, connected: true, error: 'Stripe configuration unavailable.' };
  }

  try {
    const url = new URL(
      `https://api.stripe.com/v2/core/accounts/${encodeURIComponent(accountId)}`
    );
    url.searchParams.append('include[0]', 'configuration.merchant');
    url.searchParams.append('include[1]', 'configuration.recipient');

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
    const transferCapability = account.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers;
    const transferStatus = transferCapability?.status;
    const transferRequested = transferCapability?.requested;
    const recipient = account.configuration?.recipient;
    const transferDetails = !recipient
      ? 'Stripe did not return a recipient configuration. The account cannot yet receive destination transfers.'
      : !transferCapability
      ? 'Recipient configuration exists, but Stripe did not return the stripe_transfers capability.'
      : transferCapability.status_details?.code
      ? `Stripe reason: ${transferCapability.status_details.code}`
      : undefined;

    return {
      connected: true,
      paymentsEnabled: paymentStatus === 'active',
      payoutsEnabled: payoutStatus === 'active',
      payoutsRestricted: payoutStatus === 'restricted',
      transfersDetail: transferDetails,
      transfersStatus: transferStatus === 'active' ? 'Active — destination transfers allowed' : transferStatus === 'restricted' ? 'Restricted — Stripe requirements outstanding' : transferStatus === 'pending' ? 'Pending Stripe review' : transferRequested ? `Requested — ${transferStatus || 'awaiting activation'}` : transferStatus ? `Not active (${transferStatus})` : 'Not requested or not returned by Stripe',
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
    ? await getStripeStatus(getActiveTutorStripeAccountId(profile))
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

  const overdueTutorSessions = tutorBookings
    .filter(booking => booking.status === 'PAID' &&
      booking.startsAt.getTime() + booking.durationMinutes * 60000 <= now.getTime())
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

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

  const parentProposals = parentBookings.filter(
    booking => booking.status === 'PROPOSED' && booking.startsAt > now
  );

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

  // Group conversations by the underlying account, not by display name.
  const conversationGroups = Array.from(
    inquiries.reduce((groups, inquiry) => {
      const accountId = isTutor ? inquiry.parentId : inquiry.tutorId;
      const key = String(accountId);
      const existing = groups.get(key);
      if (existing) existing.push(inquiry);
      else groups.set(key, [inquiry]);
      return groups;
    }, new Map<string, typeof inquiries>())
  );

  const acceptedIds = inquiries.filter(inquiry => inquiry.status === 'ACCEPTED').map(inquiry => inquiry.id);
  const [incomingMessages, messageReadStates] = acceptedIds.length
    ? await Promise.all([
        db.message.findMany({ where: { inquiryId: { in: acceptedIds }, senderId: { not: who.id } }, select: { inquiryId: true, createdAt: true } }),
        db.messageReadState.findMany({ where: { userId: who.id, inquiryId: { in: acceptedIds } }, select: { inquiryId: true, lastReadAt: true } }),
      ])
    : [[], []];
  const lastReadByInquiry = new Map(messageReadStates.map(state => [state.inquiryId, state.lastReadAt]));
  const unreadByInquiry = new Map<string, number>();
  for (const message of incomingMessages) {
    const lastRead = lastReadByInquiry.get(message.inquiryId);
    if (!lastRead || message.createdAt > lastRead) unreadByInquiry.set(message.inquiryId, (unreadByInquiry.get(message.inquiryId) || 0) + 1);
  }
  const unreadMessages = Array.from(unreadByInquiry.values()).reduce((sum, count) => sum + count, 0);

  // Keep action items separate from the full booking history.
  const tutorActionBookings =
    isTutor && profile
      ? await db.booking.findMany({
          where: {
            tutorId: profile.id,
            status: { in: ['CHANGE_REQUESTED', 'PROPOSED', 'PENDING_PAYMENT'] },
            OR: [
              { startsAt: { gte: now } },
              { status: 'CHANGE_REQUESTED', requestedStartsAt: { gte: now } },
            ],
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

  const pendingInquiryItems = inquiries.filter(inquiry => inquiry.status === 'OPEN');
  const acceptedInquiryItems = inquiries.filter(inquiry => inquiry.status === 'ACCEPTED');

  const activeParentInquiries = inquiries.filter(
    inquiry =>
      inquiry.status === 'OPEN' ||
      inquiry.status === 'ACCEPTED'
  ).length;

  return (
    <main>
      <ConversationDeepLink />
      <h1>
        {isTutor
          ? 'Tutor Dashboard'
          : isParent
          ? 'Parent Dashboard'
          : 'Dashboard'}
      </h1>

      <p className="muted">Account type: {who.role}</p>

      {(isTutor || isParent) && (
        <nav className="dashboard-quick-nav" aria-label="Dashboard shortcuts">
          <a href="#dashboard-overview">Overview</a>
          <a href="#my-calendar">Calendar</a>
          {isParent && parentProposals.length > 0 && <a href="#my-calendar">Proposals ({parentProposals.length})</a>}
          {isParent && awaitingPayment.length > 0 && <a href="#payments">Payments ({awaitingPayment.length})</a>}
          {isTutor && <a href="#needs-attention">Needs attention</a>}
          <Link href="/dashboard/bookings">My Sessions</Link>
          <a href="#conversations">Messages &amp; inquiries{unreadMessages > 0 ? ` (${unreadMessages} new)` : isTutor && openInquiries > 0 ? ` (${openInquiries} inquiries)` : ''} </a>
          {isParent && <Link href="/tutors">Find a tutor</Link>}
        </nav>
      )}

      {isParent && acceptedInquiryItems.length > 0 && (
        <section className="card" aria-label="Book with your existing tutors" style={{ marginTop: 20 }}>
          <h2>Book with a tutor you already know</h2>
          <p className="muted">Choose a tutor below to open the calendar with your existing connection selected. No new inquiry or tutor search is needed.</p>
          <div style={{ display: 'grid', gap: 10, margin: '16px 0' }}>
            {Array.from(new Map(acceptedInquiryItems.map(inquiry => [inquiry.tutorId, inquiry])).values()).map(inquiry => (
              <div key={inquiry.tutorId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, padding: 12, border: '1px solid #dce3ea', borderRadius: 10 }}>
                <div><strong>{inquiry.tutor.user.name || 'Your tutor'}</strong><div className="muted">{inquiry.subject} · {inquiry.grade}</div></div>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
                  <Link className="button" href={`/dashboard?bookWith=${encodeURIComponent(inquiry.id)}#my-calendar`}>Book again</Link>
                  <Link href={`/dashboard/messages/${encodeURIComponent(inquiry.id)}`}>Message tutor</Link>
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <a className="button" href="#my-calendar">Book another session</a>
            <a href="#conversations" style={{ alignSelf: 'center' }}>Message your tutor</a>
            <Link href="/dashboard/bookings" style={{ alignSelf: 'center' }}>View all sessions</Link>
          </div>
        </section>
      )}

      {isParent && parentProposals.length > 0 && (
        <div className="dashboard-action-banner" role="status">
          <div>
            <strong>{parentProposals.length} {parentProposals.length === 1 ? 'session proposal needs' : 'session proposals need'} your response</strong>
            <p>Review the tutor's proposed time before confirming a booking.</p>
          </div>
          <a href="#my-calendar">Review in calendar</a>
        </div>
      )}

      {isParent && awaitingPayment.length > 0 && (
        <div className="dashboard-action-banner" role="status">
          <div>
            <strong>{awaitingPayment.length} {awaitingPayment.length === 1 ? 'session needs payment' : 'sessions need payment'}</strong>
            <p>Finish payment to confirm your tutoring {awaitingPayment.length === 1 ? 'session' : 'sessions'}.</p>
          </div>
          <a href="#payments">Review payments</a>
        </div>
      )}

      {isTutor && (openInquiries > 0 || tutorNeedsResponse.length > 0 || overdueTutorSessions.length > 0) && (
        <div className="dashboard-action-banner" role="status">
          <div>
            <strong>You have items needing attention</strong>
            <p>{openInquiries} new inquiries · {tutorNeedsResponse.length} scheduling requests · {overdueTutorSessions.length} sessions to complete.</p>
          </div>
          <a href="#needs-attention">Review items</a>
        </div>
      )}



      {(isTutor || isParent) && (
        <section id="my-calendar" className="card" style={{ marginTop: 28 }}>
          <h2>{isParent ? 'Schedule your next tutoring session' : 'Session calendar'}</h2>
          {isParent && <p className="muted">Choose an existing tutor connection and an available time below. Your tutor can confirm or propose an alternative.</p>}
          {isTutor && <p className="muted">Awaiting-payment sessions reserve their times. Proposed sessions are requests, not confirmed availability.</p>}
          <SessionCalendar role={who.role} bookingContacts={isTutor ? Array.from(new Map(inquiries.filter(inquiry => inquiry.status === 'ACCEPTED').map(inquiry => [inquiry.parentId, { id: inquiry.id, name: inquiry.parent.name || 'Parent', subject: inquiry.subject, grade: inquiry.grade }])).values()) : isParent ? Array.from(new Map(inquiries.filter(inquiry => inquiry.status === 'ACCEPTED').map(inquiry => [inquiry.tutorId, { id: inquiry.id, name: inquiry.tutor.user.name || 'Tutor', subject: inquiry.subject, grade: inquiry.grade }])).values()) : []} />

        </section>
      )}


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
          <section id="dashboard-overview" style={{ marginTop: 24 }}>
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
                detail="Estimated tutor share; bank payouts and adjustments are separate"
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
                  <strong>Destination transfers:</strong>{' '}
                  {stripe.error ? 'Status unavailable' : stripe.transfersStatus}
                </p>
                {stripe.transfersDetail && !stripe.error && (
                  <p className="muted">{stripe.transfersDetail}</p>
                )}
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
          <section id="dashboard-overview" style={{ marginTop: 24 }}>
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
                label="Total Session Spending"
                value={money(totalParentSpending)}
                detail={`${paidParentBookings.length} paid or completed sessions; excludes refunds`}
              />
            </div>
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



          {awaitingPayment.length > 0 && (
          <section className="card" style={{ marginTop: 24 }} id="payments">
            <h2>Payments Awaiting Action ({awaitingPayment.length})</h2>
              <>
                <p className="muted">
                  Your tutor has accepted these bookings. Pay securely below to confirm your session.
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
                    {booking.paymentDueAt && (
                      <p className="muted">Payment deadline: {sessionDate(booking.paymentDueAt)}</p>
                    )}
                    <DirectPaymentButton bookingId={booking.id} amount={money(booking.amountCents)} />
                  </div>
                ))}
              </>
          </section>
          )}
        </>
      )}



      {isParent && pendingInquiryItems.length > 0 && (
        <section className="card" style={{ marginTop: 24 }}>
          <h2>Waiting for tutor response ({pendingInquiryItems.length})</h2>
          <p className="muted">Your requests have been sent. The tutor must accept the inquiry before scheduling can begin.</p>
          {pendingInquiryItems.slice(0, 5).map(inquiry => (
            <p key={inquiry.id}><strong>{inquiry.tutor.user.name}</strong> · {inquiry.subject} · {inquiry.grade} · <span className="muted">Awaiting reply</span> · <a href={`/dashboard?conversation=${encodeURIComponent(inquiry.tutorId)}&panel=inquiries`}>View inquiry</a></p>
          ))}
          <a href="#conversations">View inquiries and messages</a>
        </section>
      )}

      {isTutor && acceptedInquiryItems.length > 0 && (
        <section className="card" style={{ marginTop: 20 }}>
          <details>
            <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: '1.1rem' }}>Accepted inquiries — schedule another session ({acceptedInquiryItems.length})</summary>
            <p className="muted">Open a conversation to propose another session or message the parent. Existing sessions are listed under My Sessions.</p>
            {acceptedInquiryItems.slice(0, 8).map(inquiry => (
              <p key={inquiry.id}><strong>{inquiry.parent.name}</strong> · {inquiry.subject} · {inquiry.grade} · <a href={`/dashboard?conversation=${encodeURIComponent(inquiry.parentId)}&panel=sessions`}>Open scheduling</a></p>
            ))}
            <a href="#conversations">Open messages and scheduling</a>
          </details>
        </section>
      )}

      {isTutor && pendingInquiryItems.length > 0 && (
        <section className="card" style={{ marginTop: 24 }}>
          <h2>New tutoring inquiries ({pendingInquiryItems.length})</h2>
          <p className="muted">Review each request, then accept or decline. Accepting opens scheduling and messaging; it does not charge the parent.</p>
          {pendingInquiryItems.slice(0, 10).map(inquiry => (
            <div key={inquiry.id} style={{ padding: '12px 0', borderBottom: '1px solid #e5e7eb' }}>
              <strong>{inquiry.parent.name}</strong> · {inquiry.subject} · {inquiry.grade}
              <p style={{ whiteSpace: 'pre-wrap', margin: '8px 0' }}>{inquiry.message}</p>
              <InquiryActions inquiryId={inquiry.id} status={inquiry.status} />
            </div>
          ))}
          {pendingInquiryItems.length > 10 && <a href="#conversations">Review other inquiries</a>}
        </section>
      )}

      {isTutor && (
        <section className="card" style={{ marginTop: 24 }} id="needs-attention">
          <h2>Needs Your Attention</h2>
          {overdueTutorSessions.length > 0 && (
            <div style={{ borderLeft: '4px solid #b45309', paddingLeft: 12, marginBottom: 18 }}>
              <h3>Awaiting completion ({overdueTutorSessions.length})</h3>
              <p className="muted">These paid sessions have ended but have not been marked completed.</p>
              {overdueTutorSessions.map(booking => (
                <p key={booking.id}>
                  <strong>{booking.parent.name}</strong> · {sessionDate(booking.startsAt)}
                  {' · '}{booking.inquiry?.subject || 'Tutoring'}
                  {' · '}<BookingJump bookingId={booking.id} inquiryId={booking.inquiryId} />
                </p>
              ))}
            </div>
          )}
          <p className="muted">
            Respond to scheduling requests by opening the relevant session. You can accept the proposed time or suggest another.
          </p>
          {tutorNeedsResponse.length === 0 ? (
            <p>No scheduling requests need a response right now.</p>
          ) : (
            tutorNeedsResponse.map(booking => (
              <p key={booking.id}>
                <strong>{booking.parent.name}</strong> · {booking.inquiry?.subject || 'Tutoring'}
                {' — '}requested {sessionDate(booking.requestedStartsAt || booking.startsAt)}
                {' · '}<BookingJump bookingId={booking.id} inquiryId={booking.inquiryId} />
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
        <section style={{ marginTop: 28 }} id="conversations">
          <h2>Messages &amp; Inquiries {unreadMessages > 0 && <span style={{ color: "#b45309", fontSize: "0.75em" }}>({unreadMessages} new)</span>}</h2>
          <p><Link href="/dashboard/bookings">View all sessions and payments</Link></p>
          <p className="muted">
            Choose a conversation to message a tutor or parent, review inquiries, or manage scheduling. For a quick view of all bookings, open My Sessions.
          </p>

          {inquiries.length === 0 && (
            <div className="card">
              <p>No inquiries yet.</p>
            </div>
          )}

          {conversationGroups.map(([accountId, conversations]) => {
            const accepted = conversations.filter(inquiry => inquiry.status === 'ACCEPTED');
            const primaryId = accepted[accepted.length - 1]?.id;
            const inquiryIds = accepted.map(inquiry => inquiry.id);
            const partnerName = isTutor ? conversations[0].parent.name : conversations[0].tutor.user.name;
            return (
              <details className="card conversation-card" data-conversation-group="true" data-conversation-id={accountId} key={accountId} style={{ marginBottom: 16 }}>
                <summary className="conversation-summary">
                  <span>{partnerName}{conversations.reduce((sum, inquiry) => sum + (unreadByInquiry.get(inquiry.id) || 0), 0) > 0 && <strong style={{ marginLeft: 12, color: "#b45309" }}>● {conversations.reduce((sum, inquiry) => sum + (unreadByInquiry.get(inquiry.id) || 0), 0)} new</strong>}</span>
                  <span className="conversation-summary-meta">{accepted.length} accepted {accepted.length === 1 ? 'inquiry' : 'inquiries'}</span>
                </summary>
                <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
                  {primaryId && <div><MessagePartnerButton name={partnerName} /></div>}
                  <details data-inquiry-panel="true">
                    <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
                      Inquiry history ({conversations.length})
                    </summary>
                    {conversations.map(inquiry => (
                      <div id={`inquiry-${inquiry.id}`} key={inquiry.id} style={{ padding: '10px 0', borderBottom: '1px solid #e5e7eb' }}>
                        <strong>{inquiry.subject} — {inquiry.grade} · {inquiry.status}</strong>
                        <p>{inquiry.message}</p>
                        {isTutor && <InquiryActions inquiryId={inquiry.id} status={inquiry.status} />}
                      </div>
                    ))}
                  </details>
                  {primaryId && (
                    <>
                      <details data-message-panel="true" className="conversation-panel">
                        <summary className="conversation-panel-summary">Messages with {partnerName}</summary>
                        <InquiryMessages inquiryId={primaryId} inquiryIds={inquiryIds} />
                      </details>
                      <details data-session-panel="true" className="conversation-panel">
                        <summary className="conversation-panel-summary">Tutoring sessions · scheduling and payments</summary>
                        <BookingManager inquiryId={primaryId} inquiryIds={inquiryIds} role={who.role} tutorId={conversations[0].tutorId} />
                      </details>
                    </>
                  )}
                </div>
              </details>
            );
          })}
        </section>
      )}
    </main>
  );
}
