
import { db } from './db';

type NotificationType =
  | 'CONFIRMED'
  | 'CANCELLED'
  | 'REFUNDED'
  | 'REMINDER';

type RecipientRole = 'parent' | 'tutor';

const LOCK_TIMEOUT_MS = 10 * 60 * 1000;

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
): Promise<string | null> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  const testRecipient = process.env.EMAIL_TEST_TO;

  if (!apiKey || !from || !testRecipient) {
    throw new Error(
      'Resend test email configuration is missing'
    );
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

  const result = await response.json().catch(
    () => null
  );

  if (!response.ok) {
    console.error('Resend delivery error', {
      status: response.status,
      code: result?.name,
      message: result?.message,
    });

    throw new Error(
      `Resend did not accept email (${response.status})`
    );
  }

  return typeof result?.id === 'string'
    ? result.id
    : null;
}

async function sendTrackedReminder(
  bookingId: string,
  role: RecipientRole,
  to: string,
  subject: string,
  body: string
): Promise<void> {
  const type = 'REMINDER';
  const idempotencyKey =
    `reminder-${bookingId}-${role}`;

  const existing = await db.notificationDelivery.upsert({
    where: {
      bookingId_type_recipientRole: {
        bookingId,
        type,
        recipientRole: role,
      },
    },
    create: {
      bookingId,
      type,
      recipientRole: role,
      recipientEmail: to,
      idempotencyKey,
      status: 'PENDING',
    },
    update: {},
  });

  if (existing.status === 'SENT') {
    return;
  }

  // Claim the record atomically. Another cron
  // execution cannot claim it simultaneously.
  const staleBefore = new Date(
    Date.now() - LOCK_TIMEOUT_MS
  );

  const claimed = await db.notificationDelivery.updateMany({
    where: {
      id: existing.id,
      OR: [
        { status: 'PENDING' },
        { status: 'FAILED' },
        {
          status: 'PROCESSING',
          updatedAt: { lt: staleBefore },
        },
      ],
    },
    data: {
      status: 'PROCESSING',
      attempts: { increment: 1 },
      recipientEmail: to,
      lastError: null,
    },
  });

  if (claimed.count !== 1) {
    return;
  }

  try {
    // Recheck immediately before sending.
    const booking = await db.booking.findUnique({
      where: { id: bookingId },
      select: {
        status: true,
        startsAt: true,
      },
    });

    if (
      !booking ||
      booking.status !== 'PAID' ||
      booking.startsAt <= new Date()
    ) {
      await db.notificationDelivery.update({
        where: { id: existing.id },
        data: {
          status: 'FAILED',
          lastError:
            'Booking no longer eligible for reminder',
        },
      });

      return;
    }

    const providerId = await sendEmail(
      to,
      subject,
      body,
      idempotencyKey
    );

    await db.notificationDelivery.update({
      where: { id: existing.id },
      data: {
        status: 'SENT',
        providerId,
        sentAt: new Date(),
        lastError: null,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Unknown email error';

    await db.notificationDelivery.update({
      where: { id: existing.id },
      data: {
        status: 'FAILED',
        lastError: message.slice(0, 1000),
      },
    });

    throw error;
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
    throw new Error(
      'Booking not found for notification'
    );
  }

  if (
    type === 'REMINDER' &&
    (
      booking.status !== 'PAID' ||
      booking.startsAt <= new Date()
    )
  ) {
    return;
  }

  const parent = booking.parent;
  const tutor = booking.tutor.user;
  const date = formatDate(booking.startsAt);
  const price = formatMoney(booking.amountCents);
  const subject =
    booking.inquiry?.subject || 'Tutoring';
  const grade =
    booking.inquiry?.grade || 'Not specified';

  const dashboard =
    (
      process.env.NEXTAUTH_URL ||
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
        booking.amountCents -
        booking.platformFeeCents
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
    heading =
      'Tutoring session refund confirmed';

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
    heading =
      'Reminder: tutoring session tomorrow';

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

  const notifications: {
    to: string;
    subject: string;
    body: string;
    role: RecipientRole;
  }[] = [
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
    notifications.map(item =>
      type === 'REMINDER'
        ? sendTrackedReminder(
            booking.id,
            item.role,
            item.to,
            item.subject,
            item.body
          )
        : sendEmail(
            item.to,
            item.subject,
            item.body
          )
    )
  );

  const failures = results.filter(
    result => result.status === 'rejected'
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
