// Keep one authoritative checkout implementation for all entry points.
// The primary handler validates parent ownership, Stripe capability,
// booking amount, session reuse, and concurrent booking updates.
import { POST as checkout } from '../../../checkout/route';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  const forwarded = new Request(request.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: request.headers.get('cookie') || '' },
    body: JSON.stringify({ bookingId: id }),
  });

  return checkout(forwarded);
}
