// Legacy Stripe webhook URL retained for existing Stripe endpoint configurations.
// Both URLs must use the same verified handler so destination charges and
// historical connected-account direct charges are reconciled consistently.
export { dynamic, runtime, POST } from '../../stripe/webhook/route';
