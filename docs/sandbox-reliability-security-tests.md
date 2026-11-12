# Stripe sandbox pre-launch reliability and access-control test plan

Scope: `stripe-testing` preview only. Never run these against production or live keys. Use fictional test accounts. Record the HTTP response, booking status, Stripe event ID, and Vercel deployment SHA for each case.

## Automated/code-level safeguards already in place
- Booking ACCEPT, ACCEPT_REQUESTED_TIME, and REVISE now use a per-tutor PostgreSQL transaction advisory lock and an overlap check. Concurrent acceptance of competing sessions should allow at most one reservation.
- Cancellation refunds use a Stripe idempotency key scoped to the booking ID, and only update PAID -> REFUNDED conditionally. Webhook refund reconciliation also only updates PAID -> REFUNDED.
- Admin refund scan and reconciliation verify the current database role is ADMIN. The scan is read-only and the reconciliation endpoint never creates refunds.
- Refund webhook verifies signature and connected account, booking metadata, payment intent, currency and amount.

## Manual sandbox tests still required (not yet passed)
1. **Concurrent acceptance:** Create two PROPOSED bookings for the same tutor and overlapping future slots. Submit two parent ACCEPT requests nearly simultaneously. Expect exactly one PENDING_PAYMENT and one 409; no duplicate reserved slot.
2. **Revise/accept race:** Create a CHANGE_REQUESTED booking and another overlapping PROPOSED booking for the same tutor. Concurrently submit tutor REVISE and parent ACCEPT. Verify the final state never includes two overlapping PENDING_PAYMENT/PAID bookings. REVISE may remain PROPOSED and is not a reservation, so test a subsequent ACCEPT of that proposal too.
3. **Double cancellation:** On a newly paid sandbox booking, submit two simultaneous CANCEL requests. Verify Stripe contains exactly one full refund and one application fee reversal; DB shows REFUNDED; no duplicate email deliveries.
4. **Authorization:** Sign in as a different parent and as a different tutor. Attempt PATCH actions on a booking not owned/assigned to them. Expect 403, no Stripe operation, no DB changes.
5. **Admin endpoints:** As parent, tutor, and signed-out user, POST to /api/admin/refunds/scan and /api/admin/refunds/reconcile. Expect 403; no sensitive results or DB changes.
6. **Exceptional refund reconciliation:** Create a *new* sandbox booking, pay it, then issue one full refund directly in Stripe with metadata bookingId, without using the website cancellation. Verify refund webhook updates PAID -> REFUNDED; if it does not, run admin scan and verify the existing-refund reconciliation. Do not refund the same booking twice.
7. **Webhook replay:** Resend a completed checkout or refund event from Stripe Workbench. Verify status and notification records remain idempotent.
8. **Dashboard:** After tutor cancellation, verify earnings summary updates without a hard refresh.

## Important limits
- A successful read-only scan checks only up to 25 recent PAID bookings; it is not a comprehensive audit.
- Existing refund reconciliation requires a single succeeded full refund with matching booking metadata. Manual Stripe refunds without metadata need separate review.
- A 200 webhook response proves receipt, not necessarily a database transition when the booking was already reconciled.
- Tutor payout capability is currently restricted on the fictional sandbox profile. Never submit real identity documents for the fictional tutor.
- Do not enable live payments or merge to main without explicit approval and documented results.
