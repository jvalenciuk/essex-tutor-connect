
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

  return Response.json(message, { status: 201 });
}
