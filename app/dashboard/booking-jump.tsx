'use client';

type Props = { bookingId: string; inquiryId: string | null };

export default function BookingJump({ bookingId, inquiryId }: Props) {
  function openBooking() {
    if (!inquiryId) return;
    const conversation = document.getElementById('inquiry-' + inquiryId);
    if (!(conversation instanceof HTMLDetailsElement)) return;
    let ancestor: HTMLElement | null = conversation;
    while (ancestor) {
      if (ancestor instanceof HTMLDetailsElement) ancestor.open = true;
      ancestor = ancestor.parentElement;
    }
    const panel = conversation.querySelector<HTMLDetailsElement>('details[data-session-panel="true"]');
    if (panel) panel.open = true;
    window.dispatchEvent(new CustomEvent('essex:focus-booking', {
      detail: { bookingId, inquiryId },
    }));
    let attempts = 0;
    function focus() {
      const card = document.getElementById('booking-' + bookingId);
      if (card && conversation?.contains(card)) {
        let parent = card.parentElement;
        while (parent) {
          if (parent instanceof HTMLDetailsElement) parent.open = true;
          parent = parent.parentElement;
        }
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.focus({ preventScroll: true });
      } else if (++attempts < 80) {
        window.setTimeout(focus, 100);
      }
    }
    window.setTimeout(focus, 100);
  }

  return <button type="button" onClick={openBooking} disabled={!inquiryId}>Open session</button>;
}
