
import { db } from '../../../../lib/db';
import { identity, fail } from '../../../../lib/security';

export const dynamic = 'force-dynamic';

const STRIPE_API = 'https://api.stripe.com';
const STRIPE_VERSION = '2026-10-28.endive';

async function stripeRequest(
  path: string,
  secretKey: string,
  body: Record<string, unknown>,
  idempotencyKey?: string
) {
  const response = await fetch(`${STRIPE_API}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Stripe-Version': STRIPE_VERSION,
      'Content-Type': 'application/json',
      ...(idempotencyKey
        ? { 'Idempotency-Key': idempotencyKey }
        : {}),
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });

  const result = await response.json();

  if (!response.ok) {
    console.error('Stripe API error', {
      status: response.status,
      code: result.error?.code,
      message: result.error?.message,
      requestId: response.headers.get('request-id'),
    });

    throw new Error(
      result.error?.message || 'Stripe request failed'
    );
  }

  return result;
}

export async function POST() {
  const who = await identity();

  if (!who) {
    return fail('Sign in required', 401);
  }

  if (who.role !== 'TUTOR') {
    return fail('Tutor account required', 403);
  }

  const profile = await db.tutorProfile.findUnique({
    where: { userId: who.id },
    include: {
      user: {
        select: { email: true },
      },
    },
  });

  if (!profile || profile.verification !== 'APPROVED') {
    return fail('Approved tutor profile required', 403);
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey || !secretKey.startsWith('sk_test_')) {
    return fail('Stripe sandbox is not configured', 503);
  }

  const baseUrl =
    process.env.NEXTAUTH_URL ||
    'https://essex-tutor-connect.vercel.app';

  try {
    let accountId = profile.stripeAccountId;

    if (!accountId) {
      const account = await stripeRequest(
        '/v2/core/accounts',
        secretKey,
        {
          contact_email: profile.user.email,
          identity: {
            country: 'CA',
          },
          dashboard: 'full',
          defaults: {
            responsibilities: {
              fees_collector: 'stripe',
              losses_collector: 'stripe',
            },
          },
          configuration: {
            recipient: {
              capabilities: {
                stripe_balance: {
                  stripe_transfers: {
                    requested: true,
                  },
                },
              },
            },
          },
          metadata: {
            tutorProfileId: profile.id,
          },
        },
        `tutor-connect-v2-full-${profile.id}`
      );

      accountId = account.id;

      if (!accountId) {
        throw new Error('Stripe did not return an account ID');
      }

      await db.tutorProfile.update({
        where: { id: profile.id },
        data: { stripeAccountId: accountId },
      });
    }

    const accountLink = await stripeRequest(
      '/v2/core/account_links',
      secretKey,
      {
        account: accountId,
        use_case: {
          type: 'account_onboarding',
          account_onboarding: {
            configurations: ['recipient'],
            return_url: `${baseUrl}/dashboard`,
            refresh_url: `${baseUrl}/dashboard`,
            collection_options: {
              fields: 'eventually_due',
            },
          },
        },
      }
    );

    if (!accountLink.url) {
      throw new Error(
        'Stripe did not return an onboarding URL'
      );
    }

    return Response.json({ url: accountLink.url });
  } catch (error) {
    console.error('Stripe Connect onboarding failed', error);

    return fail(
      'Unable to start Stripe onboarding',
      500
    );
  }
}
