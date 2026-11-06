
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function InquiryActions({
  inquiryId,
  status,
}: {
  inquiryId: string;
  status: string;
}) {
  const router = useRouter();
  const [currentStatus, setCurrentStatus] = useState(status);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function updateStatus(
    newStatus: 'ACCEPTED' | 'DECLINED'
  ) {
    setLoading(true);
    setError('');

    try {
      const response = await fetch(
        `/api/inquiries/${encodeURIComponent(inquiryId)}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ status: newStatus }),
        }
      );

      if (!response.ok) {
        throw new Error('Unable to update inquiry');
      }

      setCurrentStatus(newStatus);
      router.refresh();
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (currentStatus !== 'OPEN') {
    return <p>Status: {currentStatus}</p>;
  }

  return (
    <div>
      <button
        type="button"
        disabled={loading}
        onClick={() => updateStatus('ACCEPTED')}
      >
        Accept inquiry
      </button>

      {' '}

      <button
        type="button"
        disabled={loading}
        onClick={() => updateStatus('DECLINED')}
      >
        Decline inquiry
      </button>

      {loading && <p>Updating inquiry...</p>}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
