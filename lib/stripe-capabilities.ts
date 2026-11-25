import { getConfiguredStripeOnboardingSecret } from './stripe-config';

// Stripe Accounts v2 capability check for connected tutors.
// Destination charges require active recipient transfer capability.
export async function tutorCanAcceptCardPayments(
  accountId: string,
  secretKey: string
): Promise<boolean> {
  try {
    const url = new URL(
      `https://api.stripe.com/v2/core/accounts/${encodeURIComponent(accountId)}`
    );
    url.searchParams.set('include[0]', 'configuration.recipient');

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Stripe-Version': '2026-10-28.endive',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => null);
      console.error('Stripe recipient transfer capability lookup failed', {
        status: response.status,
        code: error?.error?.code,
        message: error?.error?.message,
      });
      return false;
    }

    const account = await response.json();
    return (
      recipientTransfers(account)?.status ===
      'active'
    );
  } catch (error) {
    console.error('Stripe card payment capability check failed', error);
    return false;
  }
}

type StripeStatus = {
  connected: boolean;
  paymentsEnabled: boolean;
  transfersEnabled: boolean;
  payoutsEnabled: boolean;
  payoutsRestricted: boolean;
  payoutRestrictionDetail?: string;
  transfersStatus: string;
  transfersDetail?: string;
  error?: string;
};

type CapabilityDetail = { code?: string };
type Capability = {
  status?: string;
  requested?: boolean;
  status_details?: CapabilityDetail | CapabilityDetail[];
};
type StripeAccount = {
  configuration?: {
    merchant?: { capabilities?: { card_payments?: Capability; stripe_balance?: { payouts?: Capability } } };
    recipient?: { capabilities?: { stripe_balance?: { stripe_transfers?: Capability; payouts?: Capability } } };
  };
};

function recipientTransfers(account: StripeAccount | null | undefined) {
  return account?.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers;
}

function capabilityReason(capability: Capability | undefined) {
  const details = capability?.status_details;
  return Array.isArray(details) ? details.find(detail => detail.code)?.code : details?.code;
}

export async function getStripeStatus(
  accountId: string | null | undefined
): Promise<StripeStatus> {
  const empty: StripeStatus = {
    connected: false,
    paymentsEnabled: false,
    transfersEnabled: false,
    payoutsEnabled: false,
    payoutsRestricted: false,
    transfersStatus: 'Unavailable',
  };

  if (!accountId) return empty;

  const key = getConfiguredStripeOnboardingSecret();
  if (!key) {
    return { ...empty, connected: true, error: 'Stripe configuration unavailable.' };
  }

  try {
    const url = new URL(
      `https://api.stripe.com/v2/core/accounts/${encodeURIComponent(accountId)}`
    );
    url.searchParams.append('include[0]', 'configuration.merchant');
    url.searchParams.append('include[1]', 'configuration.recipient');

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${key}`,
        'Stripe-Version': '2026-10-28.endive',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      console.error('Stripe account status lookup failed', response.status, errorBody?.error?.message ?? errorBody?.error?.code ?? 'No Stripe error details');
      return { ...empty, connected: true, error: 'Unable to verify Stripe status.' };
    }

    const account: StripeAccount = await response.json();
    const capabilities = account?.configuration?.merchant?.capabilities;
    const paymentStatus = capabilities?.card_payments?.status;
    const recipientPayouts = account?.configuration?.recipient?.capabilities?.stripe_balance?.payouts;
    const payoutCapability = recipientPayouts?.status ? recipientPayouts : capabilities?.stripe_balance?.payouts;
    const payoutStatus = payoutCapability?.status;
    const payoutRestrictionDetail = payoutStatus === 'restricted' && capabilityReason(payoutCapability) === 'requirements_past_due'
      ? 'A Stripe requirement is past due. Open Stripe to review and complete the outstanding requirement.'
      : undefined;
    const transferCapability = recipientTransfers(account);
    const transferStatus = transferCapability?.status;
    const transferRequested = transferCapability?.requested;
    const transferReason = capabilityReason(transferCapability);
    const recipient = account?.configuration?.recipient;
    const transferDetails = !recipient
      ? 'Stripe did not return a recipient configuration. The account cannot yet receive destination transfers.'
      : !transferCapability
      ? 'Recipient configuration exists, but Stripe did not return the stripe_transfers capability.'
      : transferReason
      ? `Stripe reason: ${transferReason}`
      : undefined;

    return {
      connected: true,
      paymentsEnabled: paymentStatus === 'active',
      transfersEnabled: transferStatus === 'active',
      payoutsEnabled: payoutStatus === 'active',
      payoutsRestricted: payoutStatus === 'restricted',
      payoutRestrictionDetail,
      transfersDetail: transferDetails,
      transfersStatus: transferStatus === 'active' ? 'Active — destination transfers allowed' : transferStatus === 'restricted' ? 'Restricted — Stripe requirements outstanding' : transferStatus === 'pending' ? 'Pending Stripe review' : transferRequested ? `Requested — ${transferStatus || 'awaiting activation'}` : transferStatus ? `Not active (${transferStatus})` : 'Not requested or not returned by Stripe',
    };
  } catch (error) {
    console.error('Stripe account status check failed', error);
    return { ...empty, connected: true, error: 'Stripe status check failed.' };
  }
}
