
# Essex Tutor Connect

Essex Tutor Connect is an online tutoring marketplace serving Windsor and Essex County, Ontario.

## Features

- Parent and tutor accounts
- Tutor profiles and verification
- Tutor search and inquiries
- Private messaging
- Tutoring session scheduling
- Tutor availability management
- Booking confirmations and cancellations
- Secure payments through Stripe Connect
- Booking history and dashboards

## Technology

- Next.js
- React
- TypeScript
- Prisma
- PostgreSQL (Neon)
- NextAuth
- Stripe Connect
- Vercel

## Deployment

The production website is available at:

https://essex-tutor-connect.vercel.app

## Stripe Testing Environment

This branch is named `stripe-testing`.

It is used to test Stripe payments and booking functionality before changes are introduced into production.

Testing requirements:

- Use Stripe test-mode API keys.
- Use a separate Neon testing database.
- Keep production payments and data isolated.
- Verify authentication, bookings, refunds, and webhooks before releasing changes.

## Deployment Status

Preview deployment initialization — November 10, 2026.
