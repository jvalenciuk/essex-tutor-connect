// Production checkout remains unavailable until live Stripe onboarding is approved.
// Preview and development can use sandbox Stripe keys for testing.
export function getConfiguredStripeSecret(): string | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;

  if (process.env.VERCEL_ENV === 'production') {
    return process.env.STRIPE_LIVE_ENABLED === 'true' && (key.startsWith('sk_live_') || key.startsWith('rk_live_'))
      ? key
      : null;
  }

  return (key.startsWith('sk_test_') || key.startsWith('rk_test_')) ? key : null;
}


// Tutor verification is deliberately permitted separately from card charging.
// Enabling STRIPE_LIVE_ONBOARDING_ENABLED allows only Connect onboarding/status
// with sk_live_ or rk_live_; checkout/refunds continue requiring STRIPE_LIVE_ENABLED=true.
export function getConfiguredStripeOnboardingSecret(): string | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (process.env.VERCEL_ENV === 'production') {
    return process.env.STRIPE_LIVE_ONBOARDING_ENABLED === 'true' &&
      (key.startsWith('sk_live_') || key.startsWith('rk_live_')) ? key : null;
  }
  return (key.startsWith('sk_test_') || key.startsWith('rk_test_')) ? key : null;
}

// Account identifiers are isolated by payment mode. Existing stripeAccountId values
// are legacy sandbox IDs and must NEVER be reused in Production Live Mode.
// Live-mode account IDs remain separate from legacy sandbox account IDs.
export function getActiveTutorStripeAccountId(profile: {
  stripeAccountId?: string | null;
  stripeLiveAccountId?: string | null;
} | null | undefined): string | null {
  if (!profile) return null;
  if (process.env.VERCEL_ENV === 'production') {
    return process.env.STRIPE_LIVE_ENABLED === 'true' ||
      process.env.STRIPE_LIVE_ONBOARDING_ENABLED === 'true'
      ? profile.stripeLiveAccountId ?? null
      : null;
  }
  return profile.stripeAccountId ?? null;
}
