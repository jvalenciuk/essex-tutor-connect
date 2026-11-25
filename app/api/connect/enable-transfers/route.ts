import { getActiveTutorStripeAccountId, getConfiguredStripeOnboardingSecret } from '../../../../lib/stripe-config';
import { db } from '../../../../lib/db';
import { identity, fail } from '../../../../lib/security';

export const dynamic = 'force-dynamic';

export async function POST() {
  const who = await identity();
  if (!who) return fail('Sign in required', 401);
  if (who.role !== 'TUTOR') return fail('Tutor account required', 403);

  const profile = await db.tutorProfile.findUnique({ where: { userId: who.id } });
  if (!profile || profile.verification !== 'APPROVED') {
    return fail('Approved tutor profile required', 403);
  }
  const accountId = getActiveTutorStripeAccountId(profile);
  const secret = getConfiguredStripeOnboardingSecret();
  if (!accountId || !secret) return fail('Stripe account or configuration missing', 400);

  try {
    const response = await fetch(
      `https://api.stripe.com/v2/core/accounts/${encodeURIComponent(accountId)}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secret}`,
          'Stripe-Version': '2026-10-28.endive',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          configuration: {
            recipient: {
              capabilities: {
                stripe_balance: {
                  stripe_transfers: { requested: true },
                },
              },
            },
          },
        }),
        cache: 'no-store',
      }
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const code = data?.error?.code || 'stripe_error';
      const message = data?.error?.message || 'Stripe rejected the capability request';
      console.error('Recipient transfer capability request failed', { code, status: response.status });
      return Response.json({ ok: false, message: `${message} (code: ${code})` }, { status: 422 });
    }

    // Re-read the account; an accepted update does not mean the capability is active.
    const url = new URL(`https://api.stripe.com/v2/core/accounts/${encodeURIComponent(accountId)}`);
    url.searchParams.set('include[0]', 'configuration.recipient');
    const check = await fetch(url, {
      headers: { Authorization: `Bearer ${secret}`, 'Stripe-Version': '2026-10-28.endive' },
      cache: 'no-store',
    });
    if (!check.ok) {
      return Response.json({ ok: true, message: 'Stripe accepted the request, but the current capability status could not be retrieved. Refresh your dashboard.' });
    }
    const updated = await check.json();
    const recipient = updated?.configuration?.recipient;
    const capability = recipient?.capabilities?.stripe_balance?.stripe_transfers;
    const status = capability?.status || 'not returned';
    const reason = capability?.status_details?.code;
    return Response.json({
      ok: true,
      message: !recipient
        ? 'Stripe accepted the update, but did not return a recipient configuration. Transfers are not confirmed.'
        : `Recipient transfer status: ${status}${reason ? ` (reason: ${reason})` : ''}. ${status === 'active' ? 'Transfers are enabled.' : 'Transfers are not yet confirmed active.'}`,
    });
  } catch (error) {
    console.error('Recipient transfer capability request failed', error);
    return Response.json({ ok: false, message: 'Unable to contact Stripe. Try again later.' }, { status: 502 });
  }
}
