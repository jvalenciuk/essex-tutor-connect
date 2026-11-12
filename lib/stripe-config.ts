// Live payments require a separate, explicit production opt-in.
// Preview and development deployments may use Stripe test keys only.
export function getConfiguredStripeSecret(): string | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;

  if (key.startsWith('sk_test_')) return key;

  if (
    key.startsWith('sk_live_') &&
    process.env.VERCEL_ENV === 'production' &&
    process.env.STRIPE_LIVE_ENABLED === 'true'
  ) {
    return key;
  }

  return null;
}
