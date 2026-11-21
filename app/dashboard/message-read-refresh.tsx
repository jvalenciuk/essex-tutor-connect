'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function MessageReadRefresh() {
  const router = useRouter();
  useEffect(() => {
    const onRead = () => router.refresh();
    window.addEventListener('we-learn-messages-read', onRead);
    return () => window.removeEventListener('we-learn-messages-read', onRead);
  }, [router]);
  return null;
}
