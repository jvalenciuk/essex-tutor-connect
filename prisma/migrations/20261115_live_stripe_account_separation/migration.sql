-- Add a distinct field for Stripe Live Mode connected accounts.
-- Legacy stripeAccountId and all existing payment records remain unchanged.
ALTER TABLE "TutorProfile" ADD COLUMN IF NOT EXISTS "stripeLiveAccountId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "TutorProfile_stripeLiveAccountId_key" ON "TutorProfile"("stripeLiveAccountId");
