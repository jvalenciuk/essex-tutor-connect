import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { db } from '../../../../lib/db';
import { identity } from '../../../../lib/security';

export const dynamic = 'force-dynamic';

const dateTime = (date: Date) => date.toLocaleString('en-CA', {
  timeZone: 'America/Toronto', dateStyle: 'medium', timeStyle: 'short',
});
const money = (cents: number) => new Intl.NumberFormat('en-CA', {
  style: 'currency', currency: 'CAD',
}).format(cents / 100);

const bookingStatus = {
  PROPOSED: 'Proposed',
  CHANGE_REQUESTED: 'Change requested',
  DECLINED: 'Declined',
  EXPIRED: 'Expired',
  PENDING_PAYMENT: 'Awaiting payment',
  PAID: 'Paid',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  REFUNDED: 'Refunded',
};

export default async function BookingDetail({ params }: { params: Promise<{ id: string }> }) {
  const who = await identity();
  if (!who?.id) redirect('/login');
  const admin = await db.user.findUnique({ where: { id: who.id }, select: { role: true } });
  if (admin?.role !== 'ADMIN') {
    return <main><h1>Access denied</h1><p>Administrator access is required.</p></main>;
  }

  const { id } = await params;
  const booking = await db.booking.findUnique({
    where: { id },
    select: {
      id: true, status: true, startsAt: true, durationMinutes: true, amountCents: true,
      platformFeeCents: true, stripeSessionId: true, paymentDueAt: true, updatedAt: true,
      parent: { select: { name: true } },
      tutor: { select: { user: { select: { name: true } } } },
      inquiry: { select: { subject: true, grade: true } },
      notifications: {
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        select: { id: true, type: true, recipientRole: true, status: true, attempts: true, updatedAt: true, sentAt: true },
      },
    },
  });
  if (!booking) notFound();

  const checkout = booking.stripeSessionId;
  const mode = checkout?.startsWith('cs_test_') ? 'Sandbox' : checkout?.startsWith('cs_live_') ? 'Live' : 'Unknown';
  return <main style={{ maxWidth: 1000, margin: '0 auto', paddingBottom: 48 }}>
    <Link href="/admin#bookings-needing-attention">Back to bookings needing attention</Link>
    <h1>Booking details</h1>
    <p className="muted">Booking ID <code>{booking.id}</code></p>
    <section className="card" style={{ marginBottom: 20 }}>
      <h2>Session</h2>
      <dl>
        <dt>Status</dt><dd>{bookingStatus[booking.status]}</dd>
        <dt>Parent</dt><dd>{booking.parent.name}</dd>
        <dt>Tutor</dt><dd>{booking.tutor.user.name}</dd>
        <dt>Subject</dt><dd>{booking.inquiry?.subject || 'Tutoring'}{booking.inquiry?.grade && ` · ${booking.inquiry.grade}`}</dd>
        <dt>Start (Eastern time)</dt><dd>{dateTime(booking.startsAt)} · {booking.durationMinutes} min</dd>
        <dt>Last updated (Eastern time)</dt><dd>{dateTime(booking.updatedAt)}</dd>
      </dl>
    </section>
    <section className="card" style={{ marginBottom: 20 }}>
      <h2>Payment record</h2>
      <dl>
        <dt>Booking amount</dt><dd>{money(booking.amountCents)}</dd>
        <dt>Platform fee</dt><dd>{money(booking.platformFeeCents)}</dd>
        <dt>Payment deadline (Eastern time)</dt><dd>{booking.paymentDueAt ? dateTime(booking.paymentDueAt) : 'No deadline recorded'}</dd>
        <dt>Stripe checkout reference</dt><dd>{checkout ? <><code style={{ overflowWrap: 'anywhere' }}>{checkout}</code> · {mode}</> : 'No checkout reference recorded'}</dd>
      </dl>
      <p className="muted">Use <Link href="/admin/payments">Payment reconciliation</Link> to compare booking records with Stripe.</p>
    </section>
    <section className="card">
      <h2>Notification history</h2>
      {booking.notifications.length === 0 ? <p className="muted">No tracked notifications for this booking.</p> :
        <div style={{ overflowX: 'auto' }}><table>
          <thead><tr>{['Notification', 'Recipient role', 'Status', 'Attempts', 'Last update (Eastern time)'].map(label =>
            <th key={label} scope="col" style={{ padding: 8, textAlign: 'left' }}>{label}</th>
          )}</tr></thead>
          <tbody>{booking.notifications.map(n => <tr key={n.id}>
            <td style={{ padding: 8 }}>{n.type === 'PAYMENT_EXPIRED' ? 'Payment expiration' : n.type === 'REMINDER' ? 'Session reminder' : n.type}</td>
            <td style={{ padding: 8 }}>{n.recipientRole}</td>
            <td style={{ padding: 8 }}>{n.status === 'SENT' ? 'Accepted by provider' : n.status.toLowerCase()}</td>
            <td style={{ padding: 8 }}>{n.attempts}</td>
            <td style={{ padding: 8 }}>{dateTime(n.sentAt ?? n.updatedAt)}</td>
          </tr>)}</tbody>
        </table></div>}
    </section>
  </main>;
}
