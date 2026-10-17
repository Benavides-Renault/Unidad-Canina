CREATE TABLE "ServiceHeartbeat" (
  "name" TEXT NOT NULL,
  "pulsedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "ServiceHeartbeat_pkey" PRIMARY KEY ("name")
);
