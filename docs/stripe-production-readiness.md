# Stripe production readiness — Essex Tutor Connect

Status: **NOT APPROVED FOR LIVE PAYMENTS**. This document is a checklist, not authorization to enable payments.

## Verified in sandbox
- Parent checkout, successful payment, confirmation, tutor earnings and 15% application fee.
- Cancellation/refund and exclusion of refunded bookings from earnings.
- Stripe Accounts v2 card payment and bank payout statuses displayed separately.
- Webhook code verifies signatures (5-minute tolerance), booking/session/amount/currency/connected-account matching, and performs an idempotent PAID transition.

## Environment separation — mandatory before launch
- Keep preview/test deployment on `sk_test_...` and the corresponding **test** `whsec_...`.
- Use a **separate production database** or an audited migration that clears/replaces every sandbox `stripeAccountId` and `stripeSessionId` reference. Stripe test connected accounts cannot receive live charges.
- Configure production `STRIPE_SECRET_KEY` with the **live** secret key; do not commit secrets.
- Configure production `STRIPE_WEBHOOK_SECRET` with the signing secret for the **live** endpoint, not the test endpoint.
- Set production `APP_URL` and `NEXTAUTH_URL` to the intended HTTPS production origin. Preview must use its own preview origin.
- The code only permits a live key when `VERCEL_ENV=production` and `STRIPE_LIVE_ENABLED=true`. **Do not set the opt-in until all checks below pass.**
- Verify the live Stripe platform account, Connect account configurations, fees, loss responsibilities, and payout eligibility in Stripe directly.
- Confirm production webhook destination: `https://essex-tutor-connect.vercel.app/api/stripe/webhook`, and subscribe to `checkout.session.completed` and `checkout.session.async_payment_succeeded` for connected accounts. Verify delivery and signature with the actual production endpoint.
- Re-onboard real tutors in live mode. Never use fictional Alice's identity to satisfy verification.

## Required engineering checks
- Run production build and TypeScript validation on the branch.
- Review the two checkout endpoints for consistent charge ownership and idempotency.
- Exercise concurrent checkout requests, expired sessions, repeated webhook delivery, failed payments, and refund retries.
- Verify Stripe refund records against database statuses; handle asynchronous or failed refunds and operational reconciliation.
- Verify authorization for parent/tutor/admin actions and time-slot conflicts under concurrent requests.
- Confirm notification failures do not alter payment accounting.
- Verify production and preview environments cannot share a live Stripe key or live webhook secret unintentionally.
- Check logging does not expose sensitive Stripe keys or payment details.
- Validate real tutor payout onboarding with an actual authorized tutor in a controlled live pilot.

## Release gate
Only after successful build, staging regression, environment separation, live webhook verification, real account onboarding, and explicit owner approval should `STRIPE_LIVE_ENABLED=true` be configured and the reviewed changes merged to `main`.

## Operational notes
- Dashboard earnings are estimates before Stripe fees, disputes, and adjustments; they are not confirmed payouts.
- Sandbox payout restrictions on fictional test accounts should not be resolved by submitting real personal identity documents.
- No credentials or live Stripe settings are included in this document.
