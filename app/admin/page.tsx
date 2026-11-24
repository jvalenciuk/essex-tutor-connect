import type { Prisma } from '@prisma/client';
import { identity } from '../../lib/security';
import { db } from '../../lib/db';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import Verify from './verify';
import RefundReconcile from './refund-reconcile';

export const dynamic = 'force-dynamic';

const money = (cents: number) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(cents / 100);
const dateTime = (date: Date) => date.toLocaleString('en-CA', { timeZone: 'America/Toronto', dateStyle: 'medium', timeStyle: 'short' });

const attentionFilters = [
  { value: 'all', label: 'All alerts' },
  { value: 'payment', label: 'Payment issues' },
  { value: 'email', label: 'Failed expiration emails' },
] as const;

export default async function Admin({ searchParams }: { searchParams: Promise<{ attention?: string | string[] }> }) {
  const who = await identity();
  if (!who?.id) redirect('/login');
  const admin = await db.user.findUnique({ where: { id: who.id }, select: { role: true } });
  if (admin?.role !== 'ADMIN') return <main><h1>Access denied</h1><p>Administrator access is required.</p></main>;

  const now = new Date();
  const failedExpiration = { type: 'PAYMENT_EXPIRED', status: 'FAILED' } satisfies Prisma.NotificationDeliveryWhereInput;
  const { attention: requestedFilter } = await searchParams;
  const filter = attentionFilters.find(option => option.value === requestedFilter)?.value ?? 'all';
  const paymentIssues: Prisma.BookingWhereInput[] = [
    { status: 'PENDING_PAYMENT', OR: [{ startsAt: { lte: now } }, { paymentDueAt: { lte: now } }] },
    { status: 'PAID', stripeSessionId: null },
  ];
  const emailIssues: Prisma.BookingWhereInput = { notifications: { some: failedExpiration } };
  const attentionWhere: Prisma.BookingWhereInput = { OR: [...paymentIssues, emailIssues] };
  const selectedWhere = filter === 'payment' ? { OR: paymentIssues } : filter === 'email' ? emailIssues : attentionWhere;
  const [tutors, bookings, grouped, overdue, failedEmails, legacyPending, sandboxSessions, liveSessions, attention, attentionCount, filteredAttentionCount] = await Promise.all([
    db.tutorProfile.findMany({
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    db.booking.findMany({
      include: {
        parent: { select: { name: true } },
        tutor: { include: { user: { select: { name: true } } } },
        inquiry: { select: { subject: true } },
      },
      orderBy: { startsAt: 'desc' },
      take: 100,
    }),
    db.booking.groupBy({ by: ['status'], _count: { _all: true } }),
    db.booking.count({ where: { status: 'PENDING_PAYMENT', paymentDueAt: { lte: now } } }),
    db.notificationDelivery.count({ where: failedExpiration }),
    db.booking.count({ where: { status: 'PENDING_PAYMENT', paymentDueAt: null } }),
    db.booking.count({ where: { stripeSessionId: { startsWith: 'cs_test_' } } }),
    db.booking.count({ where: { stripeSessionId: { startsWith: 'cs_live_' } } }),
    db.booking.findMany({
      where: selectedWhere,
      select: {
        id: true, status: true, startsAt: true, paymentDueAt: true, amountCents: true, stripeSessionId: true,
        parent: { select: { name: true } },
        tutor: { select: { user: { select: { name: true } } } },
        _count: { select: { notifications: { where: failedExpiration } } },
      },
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
      take: 50,
    }),
    db.booking.count({ where: attentionWhere }),
    filter === 'all' ? undefined : db.booking.count({ where: selectedWhere }),
  ]);
  const matchingCount = filteredAttentionCount ?? attentionCount;
  const counts = Object.fromEntries(grouped.map(g => [g.status, g._count._all]));
  const pendingTutors = tutors.filter(t => t.verification === 'PENDING');
  const upcoming = bookings.filter(b => b.startsAt > now &&
    (b.status === 'PAID' || b.status === 'PENDING_PAYMENT'))
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()).slice(0, 20);
  const metrics = [
    { label: 'Tutor approvals', value: pendingTutors.length },
    { label: 'Awaiting payment', value: counts.PENDING_PAYMENT || 0 },
    { label: 'Paid sessions', value: counts.PAID || 0 },
    { label: 'Completed', value: counts.COMPLETED || 0 },
    { label: 'Refunded', value: counts.REFUNDED || 0 },
    { label: 'Bookings needing attention', value: attentionCount, href: '/admin#bookings-needing-attention' },
  ];
  // Show only the mode of the configured key, never its value or any credential.
  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  const stripeKeyMode = (stripeSecret?.startsWith('sk_live_') || stripeSecret?.startsWith('rk_live_')) ? 'Live key configured'
    : (stripeSecret?.startsWith('sk_test_') || stripeSecret?.startsWith('rk_test_')) ? 'Sandbox key configured'
    : stripeSecret ? 'Unrecognized Stripe key' : 'Missing Stripe key';
  const stripeLivePayments = process.env.STRIPE_LIVE_ENABLED === 'true';
  const stripeLiveOnboarding = process.env.STRIPE_LIVE_ONBOARDING_ENABLED === 'true';
  const stripeWebhookConfigured = Boolean(process.env.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_'));
  const tutorsWithLiveAccounts = tutors.filter(t => Boolean(t.stripeLiveAccountId)).length;
  const tableStyle = { width: '100%', borderCollapse: 'collapse' as const };
  const cellStyle = { padding: '10px 12px', borderBottom: '1px solid var(--border, #ddd)', textAlign: 'left' as const };

  return <main style={{ maxWidth: 1160, margin: '0 auto', paddingBottom: 48 }}>
    <header style={{ marginBottom: 22 }}>
      <h1 style={{ marginBottom: 6 }}>Administrator Dashboard</h1>
      <p className="muted" style={{ marginTop: 0 }}>Tutor approvals, reservations and payments in one place.</p>
    </header>

    <section className="card" style={{ marginBottom: 22 }}>
      <h2 style={{ marginTop: 0 }}>Stripe Live Mode readiness</h2>
      <p><strong>Production key:</strong> {stripeKeyMode}</p>
      <p><strong>Live tutor onboarding:</strong> {stripeLiveOnboarding ? 'Enabled' : 'Disabled'}</p>
      <p><strong>Live customer payments:</strong> {stripeLivePayments ? 'Enabled — real charges possible' : 'Disabled — real charges blocked'}</p>
      <p><strong>Webhook signing secret:</strong> {stripeWebhookConfigured ? 'Configured (mode not verified)' : 'Missing or invalid format'}</p>
      <p><strong>Connected live tutors:</strong> {tutorsWithLiveAccounts} of {tutors.length}</p>
      {stripeLiveOnboarding && stripeKeyMode === 'Live key configured'
        ? <p>Approved tutors can start Live Stripe onboarding. This does not guarantee that card payments or payouts are active.</p>
        : <p className="muted">Live onboarding is gated until a Production live Stripe key and the onboarding flag have been verified. Do not enable payment processing merely to onboard tutors.</p>}
      <p className="muted">Only configuration status is displayed; API keys and signing secrets are never revealed. Verify webhook deliveries, tutor eligibility, and payment reconciliation before enabling charges.</p>
    </section>

    <section className="card" style={{ marginBottom: 22 }}>
      <h2 style={{ marginTop: 0 }}>Production operations and delivery</h2>
      <p><strong>Email delivery:</strong> {process.env.EMAIL_TEST_TO ? 'Testing mode — all notification emails are redirected to the test recipient' : 'No test redirect set — verify RESEND configuration before sending'}</p>
      <p><strong>Unpaid bookings without deadline:</strong> {legacyPending} (past sessions are eligible for expiration; future sessions remain protected)</p>
      <p><strong>Overdue payment deadlines:</strong> {overdue}</p>
      <p><strong>Historical Stripe Checkout sessions:</strong> {sandboxSessions} sandbox · {liveSessions} live</p>
      <p><strong>Failed expiration notifications:</strong> {failedEmails}</p>
      <p><strong>Scheduled expiration:</strong> Daily at 12:15 UTC via Vercel Cron. This does not guarantee exact 24-hour expiration; delayed or failed runs require attention.</p>
      <p className="muted">Values reflect the current database. A configured cron schedule is not evidence that the job executed successfully. Review deployment logs and reconcile Stripe payment states before manually changing bookings.</p>
    </section>

    <section className="cards" style={{ marginBottom: 22 }}>
      {metrics.map(m => <div className="card" key={m.label} style={{ padding: 16 }}>
        <p className="muted" style={{ margin: '0 0 6px', fontSize: 13 }}>{m.label}</p>
        {m.href
          ? <Link href={m.href} aria-label={`${m.value} bookings needing attention`}><strong style={{ fontSize: 27 }}>{m.value}</strong></Link>
          : <strong style={{ fontSize: 27 }}>{m.value}</strong>}
      </div>)}
    </section>

    <section className="card" id="bookings-needing-attention" style={{ marginBottom: 20 }}>
      <h2 style={{ marginTop: 0 }}>Bookings needing attention ({matchingCount})</h2>
      <nav aria-label="Filter bookings needing attention" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
        {attentionFilters.map(option => <Link
          key={option.value}
          href={`/admin${option.value === 'all' ? '' : `?attention=${option.value}`}#bookings-needing-attention`}
          aria-current={filter === option.value ? 'page' : undefined}
          style={{ fontWeight: filter === option.value ? 700 : 400 }}
        >{option.label}</Link>)}
      </nav>
      {attention.length === 0 ? <p className="muted">{filter === 'all' ? 'No bookings currently need follow-up.' : 'No bookings match this filter.'}</p> :
        <>
          {matchingCount > attention.length && <p>Showing the first {attention.length} bookings by session date.</p>}
          <div style={{ overflowX: 'auto' }}><table style={tableStyle}>
            <thead><tr>{['Session (Eastern time)', 'Parent', 'Tutor', 'Amount', 'Reason and follow-up'].map(h => <th key={h} scope="col" style={cellStyle}>{h}</th>)}</tr></thead>
            <tbody>{attention.map(b => <tr key={b.id}>
              <td style={cellStyle}>{dateTime(b.startsAt)}<br /><small className="muted">{b.id}</small></td>
              <td style={cellStyle}>{b.parent.name}</td>
              <td style={cellStyle}>{b.tutor.user.name}</td>
              <td style={cellStyle}>{money(b.amountCents)}</td>
              <td style={cellStyle}>
                {b.status === 'PENDING_PAYMENT' && (b.startsAt <= now || (b.paymentDueAt && b.paymentDueAt <= now)) && <p>
                  <strong>{b.paymentDueAt && b.paymentDueAt <= now ? 'Payment deadline passed' : 'Session started with payment pending'}</strong>
                  {b.paymentDueAt && <> · Due {dateTime(b.paymentDueAt)}</>}
                  <br />Check the Stripe payment and expiration job.
                </p>}
                {b.status === 'PAID' && !b.stripeSessionId && <p><strong>Paid booking missing checkout reference</strong><br />Review the payment in Stripe.</p>}
                {b._count.notifications > 0 && <p><strong>Failed expiration notifications ({b._count.notifications})</strong><br />Check the email delivery and retry logs.</p>}
              </td>
            </tr>)}</tbody>
          </table></div>
        </>}
    </section>

    <section className="card" style={{ marginBottom: 20 }}>
      <h2 style={{ marginTop: 0 }}>Upcoming sessions <span className="muted" style={{ fontSize: 15, fontWeight: 400 }}>({upcoming.length})</span></h2>
      {upcoming.length === 0 ? <p className="muted">No upcoming paid or awaiting-payment sessions.</p> :
      <div style={{ overflowX: 'auto' }}><table style={tableStyle}>
        <thead><tr>{['Date & time', 'Parent', 'Tutor', 'Subject', 'Amount', 'Status'].map(h => <th key={h} style={cellStyle}>{h}</th>)}</tr></thead>
        <tbody>{upcoming.map(b => <tr key={b.id}>
          <td style={cellStyle}>{dateTime(b.startsAt)}</td>
          <td style={cellStyle}>{b.parent.name}</td>
          <td style={cellStyle}>{b.tutor.user.name}</td>
          <td style={cellStyle}>{b.inquiry?.subject || 'Tutoring'}</td>
          <td style={cellStyle}>{money(b.amountCents)}</td>
          <td style={cellStyle}><strong>{b.status === 'PENDING_PAYMENT' ? 'Awaiting payment' : 'Paid'}</strong></td>
        </tr>)}</tbody>
      </table></div>}
    </section>

    <section className="card" style={{ marginBottom: 20 }}>
      <h2 style={{ marginTop: 0 }}>Tutor applications <span className="muted" style={{ fontSize: 15, fontWeight: 400 }}>({pendingTutors.length} pending · {tutors.filter(t => t.verification === 'APPROVED').length} approved)</span></h2>
      {pendingTutors.length === 0 && <p className="muted">No applications awaiting review.</p>}
      {pendingTutors.map(t => <div key={t.id} style={{ padding: '12px 0', borderTop: '1px solid var(--border, #ddd)' }}>
        <strong>{t.user.name}</strong> · {t.user.email}
        <p className="muted">{t.qualifications} · {t.subjects.join(', ')} · {t.grades.join(', ')} · {money(t.hourlyRateCents)}/hr</p>
        <p className="muted">Verify credentials and safeguarding documents outside the platform before approving.</p>
        <Verify id={t.id} />
      </div>)}
      {tutors.filter(t => t.verification !== 'PENDING').length > 0 &&
        <details style={{ marginTop: 12 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600 }}>View approved and rejected tutors</summary>
          {tutors.filter(t => t.verification !== 'PENDING').map(t => <div key={t.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--border, #ddd)' }}>
            <strong>{t.user.name}</strong> · {t.verification} · {t.user.email}
            <p className="muted">{t.qualifications} · {t.subjects.join(', ')} · {t.grades.join(', ')} · {money(t.hourlyRateCents)}/hr · Stripe sandbox: {t.stripeAccountId ? 'Linked' : 'Not connected'} · Stripe Live: {t.stripeLiveAccountId ? 'Linked (payout status not verified)' : 'Not connected'}</p>
            <Verify id={t.id} />
          </div>)}
        </details>}
    </section>

    <details className="card" style={{ marginBottom: 20 }}>
      <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 20 }}>Refund reconciliation</summary>
      <p className="muted">Advanced tool: verify an existing Stripe refund. This does not issue a new refund.</p>
      <RefundReconcile />
    </details>

    <details className="card">
      <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Administrator checklist</summary>
      <ol>
        <li>Review tutor applications and verify credentials and safeguarding documents.</li>
        <li>Confirm tutor availability and Stripe onboarding.</li>
        <li>Review overdue payments in Stripe before making changes.</li>
        <li>Monitor cancellations and refunds.</li>
      </ol>
      <p className="muted">A linked Stripe account does not guarantee payouts are enabled.</p>
    </details>
  </main>;
}
