CREATE TABLE "PushSubscription" (
 "id" UUID PRIMARY KEY, "userId" UUID NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT,
 "endpoint" TEXT NOT NULL UNIQUE, "p256dh" TEXT NOT NULL, "auth" TEXT NOT NULL,
 "active" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "PushSubscription_userId_active_idx" ON "PushSubscription"("userId",active);
CREATE TABLE "PushDelivery" (
 "id" UUID PRIMARY KEY, "subscriptionId" UUID NOT NULL REFERENCES "PushSubscription"(id) ON DELETE RESTRICT,
 "notificationId" UUID NOT NULL REFERENCES "Notification"(id) ON DELETE RESTRICT,
 "status" TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PROCESSING','SENT','FAILED','CANCELLED')),
 "attempts" INTEGER NOT NULL DEFAULT 0, "nextAttempt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "lockedAt" TIMESTAMPTZ(3), "sentAt" TIMESTAMPTZ(3), "lastError" TEXT,
 CONSTRAINT "PushDelivery_subscriptionId_notificationId_key" UNIQUE ("subscriptionId","notificationId")
);
CREATE INDEX "PushDelivery_status_nextAttempt_idx" ON "PushDelivery"(status,"nextAttempt");
