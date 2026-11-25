'use client';

import { useEffect } from 'react';

export default function ConversationDeepLink() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const conversation = params.get('conversation');
    const panel = params.get('panel');
    if (!conversation || !['sessions', 'messages', 'inquiries'].includes(panel || '')) return;
    if (panel === 'sessions') {
      window.location.replace('/dashboard/bookings');
      return;
    }
    const items = document.querySelectorAll<HTMLDetailsElement>('[data-conversation-group="true"]');
    const selected = Array.from(items).find(item => item.dataset.conversationId === conversation);
    if (!selected) return;
    selected.open = true;
    const target = panel === 'sessions'
      ? selected.querySelector<HTMLDetailsElement>('[data-session-panel="true"]')
      : panel === 'messages'
        ? selected.querySelector<HTMLDetailsElement>('[data-message-panel="true"]')
        : selected.querySelector<HTMLDetailsElement>('[data-inquiry-panel="true"]');
    if (target) target.open = true;
    const frame = requestAnimationFrame(() => (target || selected).scrollIntoView({ behavior: 'smooth', block: 'start' }));
    return () => cancelAnimationFrame(frame);
  }, []);
  return null;
}
