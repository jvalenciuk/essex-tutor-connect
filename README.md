# Essex Tutor Connect

Next.js 15 + PostgreSQL/Prisma + NextAuth + Stripe Connect marketplace starter for Windsor–Essex.

## Setup
1. Install Node.js 20+ and PostgreSQL. Run `npm install`.
2. Copy `.env.example` to `.env`; set a strong `NEXTAUTH_SECRET`, `DATABASE_URL`, and production HTTPS URLs.
3. Run `npx prisma db push` and `npm run dev`.
4. Register your own account. **Do not expose public admin registration.** Promote your own user to ADMIN directly in the database using a controlled operator procedure.
5. Set up Stripe Connect, onboard tutor payout accounts and populate `TutorProfile.stripeAccountId` using a secure server-side onboarding workflow (not included).
6. Set Stripe webhook endpoint `/api/webhooks/stripe` and its signing secret.
7. Deploy to an HTTPS host with managed PostgreSQL and configure environment variables.

## Current implementation
- Parent and tutor registration, password hashing, login, role-aware server routes.
- Tutor profile submission, admin review, public approved tutor directory and filters.
- Parent inquiry API and role-scoped inquiry lists.
- Booking creation API, Stripe Connect destination-charge Checkout API and signed payment webhook.
- 15% default commission configurable with `PLATFORM_COMMISSION_RATE`.

## Important: not launch-ready without further engineering
- Connect account onboarding, scheduling availability and confirmation, parent-facing inquiry/booking forms, secure messaging, notifications, refunds, disputes, cancellations, and payout lifecycle.
- Rate limits, abuse protection, email verification, password reset, CSRF/security review, audit logs, monitoring, automated tests, and webhook idempotency.
- Booking collision prevention via database constraints or transactions; pending booking expiration; pricing and commission validation.
- Legal review of Canadian privacy obligations, consent and children's safety; documented tutor identity/qualification and vulnerable-sector screening policies where applicable.
- Stripe Connect eligibility, tax/GST/HST treatment, marketplace terms, refund policy, and payment compliance.

This is an extensible **implementation starter**, not a certified production-ready service. Do not onboard real families or accept live payments until the above is completed and tested.

## Additional implemented flows
- Approved tutor directory now has a parent inquiry form, with server-side authentication and validation.
- Approved tutors can initiate Stripe Express Connect onboarding from their dashboard. Payout eligibility must be checked before accepting live charges; Stripe returning to the dashboard alone does not confirm onboarding.

## Deployment handoff
This project has **not been deployed**. You need a hosting account (e.g. Vercel), managed PostgreSQL, a Stripe Connect platform account, a domain, and production secrets. Set `APP_URL` and `NEXTAUTH_URL` to the deployed HTTPS origin, configure the database, run Prisma migrations, configure Stripe webhooks, and test using Stripe test mode. Do not switch to live payments before implementing robust scheduling, verified onboarding status checks, fraud controls, refunds, email verification, and a privacy/safeguarding review.
