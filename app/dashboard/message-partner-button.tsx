'use client';

export default function MessagePartnerButton({ name }: { name: string }) {
  function openMessages(event: React.MouseEvent<HTMLButtonElement>) {
    const group = event.currentTarget.closest('[data-conversation-group]');
    if (!(group instanceof HTMLDetailsElement)) return;
    group.open = true;
    const panel = group.querySelector('[data-message-panel]');
    if (panel instanceof HTMLDetailsElement) {
      panel.open = true;
      panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
      window.setTimeout(() => panel.querySelector('textarea')?.focus(), 120);
    }
  }

  return <button type="button" className="button" onClick={openMessages}>Send message to {name}</button>;
}
