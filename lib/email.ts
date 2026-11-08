
import { db } from './db';

type EmailKind = 'CONFIRMED' | 'CANCELLED' | 'REFUNDED';

function formatDate(date: Date) {
  return date.toLocaleString('en-CA', {
    timeZone: 'America/Toronto',
    dateStyle: 'full',
    timeStyle: 'short',
  });
}

function money(cents: number) {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
  }).format(cents / 100);
}

async function sendEmail(
  to: string,
  subject: string,
  message: string
) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!key || !from) {
    console.warn('Email configuration is missing');
    return;
  }

  const recipient = process.env.EMAIL_TEST_TO || to;

  const response = await fetch(
    'https://api.resend.com/emails',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [recipient],
        subject,
        text: message,
      }),
      cache: 'no-store',
    }
  );

  if (!response.ok) {
    const details = await response.text();
    console.error('Resend email failed', {
      status: response.status,
      details,
    });
    throw new Error('Email delivery request failed');
  }
}

export async function notifyBooking(
  bookingId: string,
  kind: EmailKind
) {
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
    console.warn('Email skipped: booking not found');
    return;
  }

  const tutorName = booking.tutor.user.name;
  const parentName = booking.parent.name;
  const date = formatDate(booking.startsAt);
  const price = money(booking.amountCents);
  const subjectName = booking.inquiry?.subject || 'Tutoring';
  const dashboard =
    'https://essex-tutor-connect.vercel.app/dashboard';

  let heading = '';
  let parentMessage = '';
  let tutorMessage = '';

  if (kind === 'CONFIRMED') {
    heading = 'Tutoring session confirmed';

    parentMessage =
      `Hello ${parentName},\n\n` +
      `Your tutoring session has been confirmed.\n\n` +
      `Tutor: ${tutorName}\n` +
      `Subject: ${subjectName}\n` +
      `Date: ${date}\n` +
      `Duration: ${booking.durationMinutes} minutes\n` +
      `Amount paid: ${price}\n\n` +
      `View your booking: ${dashboard}`;

    tutorMessage =
      `Hello ${tutorName},\n\n` +
      `A parent has paid for your tutoring session.\n\n` +
      `Parent: ${parentName}\n` +
      `Subject: ${subjectName}\n` +
      `Date: ${date}\n` +
      `Duration: ${booking.durationMinutes} minutes\n` +
      `Session price: ${price}\n\n` +
      `View your booking: ${dashboard}`;
  }

  if (kind === 'CANCELLED') {
    heading = 'Tutoring session cancelled';

    parentMessage =
      `Hello ${parentName},\n\n` +
      `Your tutoring session has been cancelled.\n\n` +
      `Tutor: ${tutorName}\n` +
      `Subject: ${subjectName}\n` +
      `Date: ${date}\n\n` +
      `No refund was required for this booking.\n\n` +
      `View your dashboard: ${dashboard}`;

    tutorMessage =
      `Hello ${tutorName},\n\n` +
      `A tutoring session has been cancelled.\n\n` +
      `Parent: ${parentName}\n` +
      `Subject: ${subjectName}\n` +
      `Date: ${date}\n\n` +
      `View your dashboard: ${dashboard}`;
  }

  if (kind === 'REFUNDED') {
    heading = 'Tutoring session refund confirmed';

    parentMessage =
      `Hello ${parentName},\n\n` +
      `Your tutoring session was cancelled and ` +
      `Stripe confirmed a full refund.\n\n` +
      `Tutor: ${tutorName}\n` +
      `Subject: ${subjectName}\n` +
      `Date: ${date}\n` +
      `Refund amount: ${price}\n\n` +
      `The refund may take additional time to ` +
      `appear on your payment method.\n\n` +
      `View your dashboard: ${dashboard}`;

    tutorMessage =
      `Hello ${tutorName},\n\n` +
      `A tutoring session was cancelled and ` +
      `Stripe confirmed a refund.\n\n` +
      `Parent: ${parentName}\n` +
      `Subject: ${subjectName}\n` +
      `Date: ${date}\n` +
      `Refund amount: ${price}\n\n` +
      `View your dashboard: ${dashboard}`;
  }

  const messages = [
    {
      to: booking.parent.email,
      subject: `${heading} — Parent notification`,
      message: parentMessage,
    },
    {
      to: booking.tutor.user.email,
      subject: `${heading} — Tutor notification`,
      message: tutorMessage,
    },
  ];

  const results = await Promise.allSettled(
    messages.map((item) =>
      sendEmail(item.to, item.subject, item.message)
    )
  );

  for (const result of results) {
    if (result.status === 'rejected') {
      console.error('Booking notification failed', result.reason);
    }
  }
}
