
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
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || 'Unable to update inquiry');
      }

      setCurrentStatus(newStatus);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (currentStatus !== 'OPEN') {
    return <div role="status"><p className="muted">{currentStatus === 'ACCEPTED' ? 'Accepted — you can now arrange a session.' : 'Inquiry declined.'}</p>{currentStatus === 'ACCEPTED' && <a href="#conversations">Open messages and scheduling</a>}</div>;
  }

  return (
    <div>
      <button
        type="button"
        disabled={loading}
        onClick={() => updateStatus('ACCEPTED')}
      >
        Accept & open scheduling
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
