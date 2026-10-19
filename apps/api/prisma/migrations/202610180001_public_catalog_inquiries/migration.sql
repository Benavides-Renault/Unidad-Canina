CREATE TYPE "InquiryKind" AS ENUM ('CONTACT', 'PURCHASE', 'ACCOUNT');
CREATE TYPE "InquiryStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'CLOSED', 'APPROVED', 'REJECTED');
CREATE TABLE "PublicSiteSettings" (
  "id" TEXT NOT NULL DEFAULT 'main', "contactName" TEXT NOT NULL DEFAULT 'ORYX K9',
  "phone" TEXT, "email" TEXT, "whatsappNumber" TEXT,
  "instagramUrl" TEXT, "facebookUrl" TEXT, "tiktokUrl" TEXT,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "PublicSiteSettings_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "CustomerInquiry" (
  "id" UUID NOT NULL, "requestKey" UUID NOT NULL, "payloadHash" TEXT NOT NULL,
  "kind" "InquiryKind" NOT NULL, "status" "InquiryStatus" NOT NULL DEFAULT 'NEW',
  "name" TEXT NOT NULL, "email" TEXT, "phone" TEXT, "preferredContact" TEXT NOT NULL,
  "partyKind" TEXT NOT NULL DEFAULT 'PERSON', "organization" TEXT, "message" TEXT NOT NULL,
  "interestKind" TEXT, "interestId" UUID, "interestLabel" TEXT,
  "consentAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "adminNotes" TEXT,
  "approvedUserId" UUID, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "CustomerInquiry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CustomerInquiry_approvedUserId_fkey" FOREIGN KEY ("approvedUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CustomerInquiry_requestKey_key" ON "CustomerInquiry"("requestKey");
CREATE INDEX "CustomerInquiry_status_createdAt_idx" ON "CustomerInquiry"("status", "createdAt");
CREATE INDEX "CustomerInquiry_kind_createdAt_idx" ON "CustomerInquiry"("kind", "createdAt");
