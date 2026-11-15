-- Non-destructive, additive migration. Existing reservations remain unchanged.
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "paymentDueAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "Booking_status_paymentDueAt_idx" ON "Booking"("status", "paymentDueAt");
