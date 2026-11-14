import { expireUnpaidBookings } from '../../../../lib/payment-expiration';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('CRON_SECRET is missing');
    return new Response('Not configured', { status: 503 });
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const expiration = await expireUnpaidBookings();
    return Response.json({ success: true, expiration }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('Scheduled payment expiration failed', error);
    return new Response('Payment expiration failed', { status: 500 });
  }
}
