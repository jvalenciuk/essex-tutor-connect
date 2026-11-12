// Stripe Accounts v2 capability check for connected tutors.
// Card payments and bank payouts are separate capabilities.
export async function tutorCanAcceptCardPayments(
  accountId: string,
  secretKey: string
): Promise<boolean> {
  try {
    const url = new URL(
      `https://api.stripe.com/v2/core/accounts/${encodeURIComponent(accountId)}`
    );
    url.searchParams.set('include[0]', 'configuration.merchant');

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Stripe-Version': '2026-10-28.endive',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => null);
      console.error('Stripe card payment capability lookup failed', {
        status: response.status,
        code: error?.error?.code,
        message: error?.error?.message,
      });
      return false;
    }

    const account = await response.json();
    return (
      account?.configuration?.merchant?.capabilities?.card_payments?.status ===
      'active'
    );
  } catch (error) {
    console.error('Stripe card payment capability check failed', error);
    return false;
  }
}
