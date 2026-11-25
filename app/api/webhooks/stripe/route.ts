// Legacy Stripe webhook URL retained for existing Stripe endpoint configurations.
// Use the same verified handler as the primary Stripe webhook.
import { POST as handleStripeWebhook } from '../../stripe/webhook/route';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const POST = handleStripeWebhook;
