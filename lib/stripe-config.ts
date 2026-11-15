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
