
'use client';

import { useState } from 'react';

type ConnectButtonProps = {
  connected?: boolean;
  payoutsEnabled?: boolean;
};

export default function ConnectButton({
  connected = false,
  payoutsEnabled = false,
}: ConnectButtonProps) {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function startOnboarding() {
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/connect/onboard', {
        method: 'POST',
      });

      const data = await response.json();

      if (!response.ok || !data.url) {
        throw new Error(
          data.error || 'Could not open Stripe onboarding'
        );
      }

      window.location.href = data.url;
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Something went wrong'
      );
      setLoading(false);
    }
  }

  const buttonLabel = loading
    ? 'Opening Stripe…'
    : payoutsEnabled
      ? 'Manage Stripe account'
      : connected
        ? 'Continue Stripe verification'
        : 'Set up tutor payouts';

  return (
    <div>
      <button
        type="button"
        disabled={loading}
        onClick={startOnboarding}
      >
        {buttonLabel}
      </button>

      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  );
}
