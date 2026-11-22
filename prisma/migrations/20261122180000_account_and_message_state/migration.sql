ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "emailVerifiedAt" TIMESTAMPTZ(6);

CREATE TABLE IF NOT EXISTS "PasswordResetThrottle" (
  "key" TEXT NOT NULL,
  "windowStart" TIMESTAMPTZ(6) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "PasswordResetThrottle_pkey" PRIMARY KEY ("key")
);

CREATE TABLE IF NOT EXISTS "MessageReadState" (
  "userId" TEXT NOT NULL,
  "inquiryId" TEXT NOT NULL,
  "lastReadAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MessageReadState_pkey" PRIMARY KEY ("userId", "inquiryId")
);
