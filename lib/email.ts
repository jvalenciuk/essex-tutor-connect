
import { db } from './db';

type NotificationType =
  | 'CONFIRMED'
  | 'CANCELLED'
  | 'REFUNDED';

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
  body: string
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  const testRecipient = process.env.EMAIL_TEST_TO;

  if (!apiKey || !from) {
    throw new Error('Resend email configuration is missing');
  }

  // Use only the verified Resend account email during testing.
  // Never send to actual users while using the testing domain.
  if (!testRecipient) {
    throw new Error(
      'EMAIL_TEST_TO must be configured for sandbox email testing'
    );
  }

  const response = await fetch(
    'https://api.resend.com/emails',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
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
        select: {
          name: true,
          email: true,
        },
      },
      tutor: {
        include: {
          user: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      },
      inquiry: {
        select: {
          subject: true,
          grade: true,
        },
      },
    },
  });

  if (!booking) {
    throw new Error('Booking not found for email notification');
  }

  const parent = booking.parent;
  const tutor = booking.tutor.user;

  const sessionDate = formatDate(booking.startsAt);
  const price = formatMoney(booking.amountCents);
  const subject = booking.inquiry?.subject || 'Tutoring';
  const grade = booking.inquiry?.grade || 'Not specified';
  const dashboard =
    (process.env.NEXTAUTH_URL ||
      'https://essex-tutor-connect.vercel.app'
    ).replace(/\/$/, '') + '/dashboard';

  const sessionDetails =
    `Subject: ${subject}\n` +
    `Grade: ${grade}\n` +
    `Date and time: ${sessionDate}\n` +
    `Duration: ${booking.durationMinutes} minutes\n` +
    `Session price: ${price}\n`;

  let emailSubject = '';
  let parentBody = '';
  let tutorBody = '';

  if (type === 'CONFIRMED') {
    emailSubject = 'Tutoring session confirmed';

    parentBody =
      `Hello ${parent.name},\n\n` +
      `Your tutoring session has been confirmed ` +
      `and your payment was received.\n\n` +
      `Tutor: ${tutor.name}\n` +
      sessionDetails +
      `\nView your booking:\n${dashboard}\n\n` +
      `Thank you for using Essex Tutor Connect.`;

    tutorBody =
      `Hello ${tutor.name},\n\n` +
      `A parent has paid for your tutoring session.\n\n` +
      `Parent: ${parent.name}\n` +
      sessionDetails +
      `Platform commission: ` +
      `${formatMoney(booking.platformFeeCents)}\n` +
      `Tutor portion before Stripe processing fees: ` +
      `${formatMoney(
        booking.amountCents - booking.platformFeeCents
      )}\n\n` +
      `View your booking:\n${dashboard}`;
  }

  if (type === 'CANCELLED') {
    emailSubject = 'Tutoring session cancelled';

    parentBody =
      `Hello ${parent.name},\n\n` +
      `Your tutoring session has been cancelled.\n\n` +
      `Tutor: ${tutor.name}\n` +
      sessionDetails +
      `\nNo payment refund was required.\n\n` +
      `View your dashboard:\n${dashboard}`;

    tutorBody =
      `Hello ${tutor.name},\n\n` +
      `A tutoring session has been cancelled.\n\n` +
      `Parent: ${parent.name}\n` +
      sessionDetails +
      `\nView your dashboard:\n${dashboard}`;
  }

  if (type === 'REFUNDED') {
    emailSubject = 'Tutoring session refund confirmed';

    parentBody =
      `Hello ${parent.name},\n\n` +
      `Your tutoring session has been cancelled ` +
      `and Stripe has confirmed your full refund.\n\n` +
      `Tutor: ${tutor.name}\n` +
      sessionDetails +
      `Refund amount: ${price}\n\n` +
      `Your refund may take additional time to ` +
      `appear on your payment method.\n\n` +
      `View your dashboard:\n${dashboard}`;

    tutorBody =
      `Hello ${tutor.name},\n\n` +
      `A tutoring session was cancelled and ` +
      `the parent's payment was refunded.\n\n` +
      `Parent: ${parent.name}\n` +
      sessionDetails +
      `Refund amount: ${price}\n\n` +
      `View your dashboard:\n${dashboard}`;
  }

  const notifications = [
    {
      to: parent.email,
      subject: `${emailSubject} — Parent`,
      body: parentBody,
    },
    {
      to: tutor.email,
      subject: `${emailSubject} — Tutor`,
      body: tutorBody,
    },
  ];

  // Attempt both emails even if one request fails.
  const results = await Promise.allSettled(
    notifications.map((item) =>
      sendEmail(item.to, item.subject, item.body)
    )
  );

  for (const result of results) {
    if (result.status === 'rejected') {
      console.error(
        'Booking email notification failed',
        result.reason
      );
    }
  }
}
