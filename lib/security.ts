import { getServerSession } from 'next-auth';
import { authOptions } from './auth';
import { db } from './db';

// Never authorize requests solely from a role cached in a JWT.
// Account roles may change or accounts may be removed after sign-in.
export async function identity() {
  const session = await getServerSession(authOptions);
  const id = (session as { uid?: unknown } | null)?.uid;
  if (typeof id !== 'string' || !id) return null;

  const user = await db.user.findUnique({
    where: { id },
    select: { id: true, role: true },
  });
  return user ? { id: user.id, role: user.role } : null;
}

export const fail = (message: string, status = 400) =>
  Response.json({ error: message }, { status });
