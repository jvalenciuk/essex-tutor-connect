
import { db } from './db';

type NotificationType =
  | 'CONFIRMED'
  | 'CANCELLED'
  | 'REFUNDED'
  | 'REMINDER';

function formatDate(date: Date): string {
  return date.toLocaleString('en-CA', {
    timeZone: 'America/Toronto',
    dateStyle: 'full',
    timeStyle: 'short',
  });
}

function formatMoney(cents: number): string {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
  }).format(cents / 100);
}

async function sendEmail(
  to: string,
  subject: string,
  body: string,
  idempotencyKey?: string
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  const testRecipient = process.env.EMAIL_TEST_TO;

  if (!apiKey || !from || !testRecipient) {
    throw new Error('Resend email configuration is missing');
  }

  const response = await fetch(
    'https://api.resend.com/emails',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(idempotencyKey
          ? { 'Idempotency-Key': idempotencyKey }
          : {}),
      },
      body: JSON.stringify({
        from,
        to: [testRecipient],
        subject,
        text:
          `Intended recipient: ${to}\n` +
          `Testing mode: no email was sent to the ` +
          `intended recipient.\n\n` +
          body,
      }),
      cache: 'no-store',
    }
  );

  if (!response.ok) {
    const result = await response.json().catch(() => null);

    console.error('Resend delivery error', {
      status: response.status,
      code: result?.name,
      message: result?.message,
    });

    throw new Error('Resend did not accept the email');
  }
}

export async function notifyBooking(
  bookingId: string,
  type: NotificationType
): Promise<void> {
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: {
      parent: {
        select: { name: true, email: true },
      },
      tutor: {
        include: {
          user: {
            select: { name: true, email: true },
          },
        },
      },
      inquiry: {
        select: { subject: true, grade: true },
      },
    },
  });

  if (!booking) {
    throw new Error('Booking not found for notification');
  }

  const parent = booking.parent;
  const tutor = booking.tutor.user;
  const date = formatDate(booking.startsAt);
  const price = formatMoney(booking.amountCents);
  const subject = booking.inquiry?.subject || 'Tutoring';
  const grade = booking.inquiry?.grade || 'Not specified';

  const dashboard =
    (process.env.NEXTAUTH_URL ||
      'https://essex-tutor-connect.vercel.app'
    ).replace(/\/$/, '') + '/dashboard';

  const details =
    `Subject: ${subject}\n` +
    `Grade: ${grade}\n` +
    `Date and time: ${date}\n` +
    `Duration: ${booking.durationMinutes} minutes\n` +
    `Session price: ${price}\n`;

  let heading = '';
  let parentBody = '';
  let tutorBody = '';

  if (type === 'CONFIRMED') {
    heading = 'Tutoring session confirmed';

    parentBody =
      `Hello ${parent.name},\n\n` +
      `Your tutoring session is confirmed and ` +
      `your payment was received.\n\n` +
      `Tutor: ${tutor.name}\n` +
      details +
      `\nView your booking:\n${dashboard}`;

    tutorBody =
      `Hello ${tutor.name},\n\n` +
      `A parent has paid for your tutoring session.\n\n` +
      `Parent: ${parent.name}\n` +
      details +
      `Platform commission: ` +
      `${formatMoney(booking.platformFeeCents)}\n` +
      `Tutor portion before Stripe fees: ` +
      `${formatMoney(
        booking.amountCents - booking.platformFeeCents
      )}\n\n` +
      `View your booking:\n${dashboard}`;
  }

  if (type === 'CANCELLED') {
    heading = 'Tutoring session cancelled';

    parentBody =
      `Hello ${parent.name},\n\n` +
      `Your tutoring session was cancelled.\n\n` +
      `Tutor: ${tutor.name}\n` +
      details +
      `\nNo payment refund was required.\n\n` +
      `View your dashboard:\n${dashboard}`;

    tutorBody =
      `Hello ${tutor.name},\n\n` +
      `A tutoring session was cancelled.\n\n` +
      `Parent: ${parent.name}\n` +
      details +
      `\nView your dashboard:\n${dashboard}`;
  }

  if (type === 'REFUNDED') {
    heading = 'Tutoring session refund confirmed';

    parentBody =
      `Hello ${parent.name},\n\n` +
      `Your session was cancelled and Stripe ` +
      `confirmed a full refund.\n\n` +
      `Tutor: ${tutor.name}\n` +
      details +
      `Refund amount: ${price}\n\n` +
      `The refund may take additional time to ` +
      `appear on your payment method.\n\n` +
      `View your dashboard:\n${dashboard}`;

    tutorBody =
      `Hello ${tutor.name},\n\n` +
      `A tutoring session was cancelled and ` +
      `the parent's payment was refunded.\n\n` +
      `Parent: ${parent.name}\n` +
      details +
      `Refund amount: ${price}\n\n` +
      `View your dashboard:\n${dashboard}`;
  }

  if (type === 'REMINDER') {
    heading = 'Reminder: tutoring session tomorrow';

    parentBody =
      `Hello ${parent.name},\n\n` +
      `This is a reminder about your upcoming ` +
      `tutoring session.\n\n` +
      `Tutor: ${tutor.name}\n` +
      details +
      `\nPlease review the session details ` +
      `and contact your tutor if necessary.\n\n` +
      `View your dashboard:\n${dashboard}`;

    tutorBody =
      `Hello ${tutor.name},\n\n` +
      `This is a reminder about your upcoming ` +
      `tutoring session.\n\n` +
      `Parent: ${parent.name}\n` +
      details +
      `\nPlease be prepared for your session.\n\n` +
      `View your dashboard:\n${dashboard}`;
  }

  const notifications = [
    {
      to: parent.email,
      subject: `${heading} — Parent`,
      body: parentBody,
      role: 'parent',
    },
    {
      to: tutor.email,
      subject: `${heading} — Tutor`,
      body: tutorBody,
      role: 'tutor',
    },
  ];

  const results = await Promise.allSettled(
    notifications.map((item) =>
      sendEmail(
        item.to,
        item.subject,
        item.body,
        type === 'REMINDER'
          ? `reminder-${booking.id}-${item.role}`
          : undefined
      )
    )
  );

  const failures = results.filter(
    (result) => result.status === 'rejected'
  );

  for (const result of failures) {
    if (result.status === 'rejected') {
      console.error(
        'Booking notification failed',
        result.reason
      );
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `${failures.length} booking notification(s) failed`
    );
  }
}
