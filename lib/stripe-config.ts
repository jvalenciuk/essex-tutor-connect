// Production checkout remains unavailable until live Stripe onboarding is approved.
// Preview and development can use sandbox Stripe keys for testing.
export function getConfiguredStripeSecret(): string | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;

  if (process.env.VERCEL_ENV === 'production') {
    return process.env.STRIPE_LIVE_ENABLED === 'true' && key.startsWith('sk_live_')
      ? key
      : null;
  }

  return key.startsWith('sk_test_') ? key : null;
}


// Account identifiers are isolated by payment mode. Existing stripeAccountId values
// are legacy sandbox IDs and must NEVER be reused in Production Live Mode.
// Production with payments disabled intentionally has no active connected account.
export function getActiveTutorStripeAccountId(profile: {
  stripeAccountId?: string | null;
  stripeLiveAccountId?: string | null;
} | null | undefined): string | null {
  if (!profile) return null;
  if (process.env.VERCEL_ENV === 'production') {
    return process.env.STRIPE_LIVE_ENABLED === 'true'
      ? profile.stripeLiveAccountId ?? null
      : null;
  }
  return profile.stripeAccountId ?? null;
}
