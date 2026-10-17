-- The navigation badge counts unread notifications independently of list pagination.
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");
