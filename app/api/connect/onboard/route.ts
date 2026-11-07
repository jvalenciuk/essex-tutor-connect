
import Stripe from 'stripe';
import { db } from '../../../../lib/db';
import { identity, fail } from '../../../../lib/security';

export const dynamic = 'force-dynamic';

export async function POST() {
  const who = await identity();

  if (!who || who.role !== 'TUTOR') {
    return fail('Tutor account required', 403);
  }

  const profile = await db.tutorProfile.findUnique({
    where: { userId: who.id },
    include: {
      user: {
        select: {
          email: true,
        },
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

  const stripe = new Stripe(secretKey);

  const baseUrl =
    process.env.NEXTAUTH_URL ||
    'https://essex-tutor-connect.vercel.app';

  try {
    let accountId = profile.stripeAccountId;

    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'CA',
        email: profile.user.email,
        capabilities: {
          transfers: { requested: true },
        },
        metadata: {
          tutorProfileId: profile.id,
        },
      });

      accountId = account.id;

      await db.tutorProfile.update({
        where: { id: profile.id },
        data: {
          stripeAccountId: accountId,
        },
      });
    }

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${baseUrl}/dashboard`,
      return_url: `${baseUrl}/dashboard`,
      type: 'account_onboarding',
    });

    return Response.json({
      url: accountLink.url,
    });
  } catch (error) {
    console.error('Stripe Connect onboarding failed', error);

    return fail('Unable to start Stripe onboarding', 500);
  }
}
