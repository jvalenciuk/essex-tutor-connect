
import { db } from '../../../lib/db';
import { identity, fail } from '../../../lib/security';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const messageSchema = z.object({
  inquiryId: z.string().min(1),
  body: z.string().trim().min(1).max(2000),
});

async function getAuthorizedInquiry(
  inquiryId: string,
  userId: string
) {
  return db.inquiry.findFirst({
    where: {
      id: inquiryId,
      status: 'ACCEPTED',
      OR: [
        { parentId: userId },
        { tutor: { userId } },
      ],
    },
    select: { id: true },
  });
}

export async function GET(req: Request) {
  const who = await identity();

  if (!who) {
    return fail('Sign in required', 401);
  }

  const inquiryId = new URL(req.url).searchParams.get('inquiryId');

  if (!inquiryId) {
    return fail('Inquiry ID required', 400);
  }

  const inquiry = await getAuthorizedInquiry(inquiryId, who.id);

  if (!inquiry) {
    return fail('Conversation unavailable', 403);
  }

  const messages = await db.message.findMany({
    where: { inquiryId },
    select: {
      id: true,
      body: true,
      senderId: true,
      createdAt: true,
      sender: {
        select: { name: true },
      },
    },
    orderBy: { createdAt: 'asc' },
    take: 200,
  });

  return Response.json(messages);
}

export async function POST(req: Request) {
  const who = await identity();

  if (!who) {
    return fail('Sign in required', 401);
  }

  let data: z.infer<typeof messageSchema>;

  try {
    data = messageSchema.parse(await req.json());
  } catch {
    return fail('Invalid message', 400);
  }

  const inquiry = await getAuthorizedInquiry(
    data.inquiryId,
    who.id
  );

  if (!inquiry) {
    return fail('Conversation unavailable', 403);
  }

  const message = await db.message.create({
    data: {
      inquiryId: data.inquiryId,
      senderId: who.id,
      body: data.body,
    },
    select: {
      id: true,
      body: true,
      senderId: true,
      createdAt: true,
    },
  });

  // Notify the other participant without exposing the private message in email.
  // Preview uses the designated test inbox rather than real user addresses.
  try {
    const conversation = await db.inquiry.findUnique({
      where: { id: data.inquiryId },
      select: { parentId: true, tutor: { select: { userId: true } } },
    });
    const recipientId = conversation?.parentId === who.id ? conversation.tutor.userId : conversation?.parentId;
    const recipient = recipientId ? await db.user.findUnique({ where: { id: recipientId }, select: { email: true } }) : null;
    const preview = process.env.VERCEL_ENV !== 'production';
    const to = preview ? process.env.EMAIL_TEST_TO : recipient?.email;
    const key = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM;
    if (to && key && from && recipientId) {
      const base = preview ? 'https://we-learn-stripe-preview.vercel.app' : (process.env.APP_URL || process.env.NEXTAUTH_URL || '');
      const link = base ? new URL('/dashboard#conversations', base).toString() : '';
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from, to: [to], subject: 'WE Learn: New tutoring message',
          text: 'You have received a new tutoring message. Sign in to read and reply: ' + link + (preview ? '\\nPreview test. Intended recipient: ' + (recipient?.email || 'unknown') : ''),
        }),
        cache: 'no-store',
      });
      if (!response.ok) console.error('Message email notification failed', response.status);
    } else console.warn('Message email notification not configured');
  } catch (error) {
    console.error('Message email notification error', error);
  }

  return Response.json(message, { status: 201 });
}
