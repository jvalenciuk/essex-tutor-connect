import { db } from '../../../lib/db';
import { identity, fail } from '../../../lib/security';

export async function POST(req: Request) {
  const who = await identity();
  if (!who) return fail('Sign in required', 401);
  let inquiryIds: string[];
  try {
    const data = await req.json();
    inquiryIds = Array.isArray(data.inquiryIds) ? data.inquiryIds.filter((id: unknown): id is string => typeof id === 'string' && id.length > 0).slice(0, 50) : [];
  } catch { return fail('Invalid request', 400); }
  if (!inquiryIds.length) return fail('Inquiry IDs required', 400);
  const allowed = await db.inquiry.findMany({
    where: { id: { in: inquiryIds }, status: 'ACCEPTED', OR: [{ parentId: who.id }, { tutor: { userId: who.id } }] },
    select: { id: true },
  });
  const now = new Date();
  await db.$transaction(allowed.map(({ id }) => db.messageReadState.upsert({
    where: { userId_inquiryId: { userId: who.id, inquiryId: id } },
    create: { userId: who.id, inquiryId: id, lastReadAt: now },
    update: { lastReadAt: now },
  })));
  return Response.json({ ok: true });
}
