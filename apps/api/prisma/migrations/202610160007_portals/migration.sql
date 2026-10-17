BEGIN;
-- CreateEnum
CREATE TYPE "PartyKind" AS ENUM ('UNIT', 'PERSON', 'MUNICIPALITY', 'ORGANIZATION');

-- CreateEnum
CREATE TYPE "CommercialCategory" AS ENUM ('NOT_LISTED', 'FOR_SALE', 'FOR_BREEDING');

-- AlterEnum
CREATE TYPE "Role_new" AS ENUM ('ADMIN', 'TRAINER', 'CLIENT');
ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role_new" USING
  (CASE WHEN "role"::text IN ('SUPERADMIN','ADMIN') THEN 'ADMIN'
        WHEN "role"::text IN ('TRAINER','VET') THEN 'TRAINER'
        ELSE 'CLIENT' END::"Role_new");
ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
DROP TYPE "public"."Role_old";

-- AlterTable
ALTER TABLE "BreedingPlan" ADD COLUMN     "contact" TEXT,
ADD COLUMN     "currency" "Currency" NOT NULL DEFAULT 'CRC',
ADD COLUMN     "publicDescription" TEXT,
ADD COLUMN     "publicTitle" TEXT,
ADD COLUMN     "published" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "puppyPrice" DECIMAL(18,2);

-- AlterTable
ALTER TABLE "Dog" ADD COLUMN     "achievements" TEXT,
ADD COLUMN     "assignedTrainerId" UUID,
ADD COLUMN     "commercialCategory" "CommercialCategory" NOT NULL DEFAULT 'NOT_LISTED',
ADD COLUMN     "custodianPartyId" UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
ADD COLUMN     "functionalities" TEXT,
ADD COLUMN     "healthSummary" TEXT,
ADD COLUMN     "ownerPartyId" UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
ADD COLUMN     "pedigreeSummary" TEXT,
ADD COLUMN     "publicDescription" TEXT,
ADD COLUMN     "saleContact" TEXT,
ADD COLUMN     "saleCurrency" "Currency" NOT NULL DEFAULT 'CRC',
ADD COLUMN     "salePrice" DECIMAL(18,2),
ADD COLUMN     "salePublished" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "trainingSummary" TEXT;

-- AlterTable
ALTER TABLE "Reservation" ADD COLUMN     "customerPartyId" UUID;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "partyId" UUID;

-- CreateTable
CREATE TABLE "Party" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "PartyKind" NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Party_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicalEntry" (
    "id" UUID NOT NULL,
    "dogId" UUID NOT NULL,
    "eventDate" DATE NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "professional" TEXT,
    "recordedBy" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMPTZ(3),

    CONSTRAINT "MedicalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Party_name_idx" ON "Party"("name");

-- Preserve existing ownership text without granting any client access by name matching.
INSERT INTO "Party" (id,name,kind,"updatedAt") VALUES
('00000000-0000-4000-8000-000000000001','VALKYR Unidad Canina','UNIT',CURRENT_TIMESTAMP);
INSERT INTO "Party" (id,name,kind,"updatedAt")
SELECT md5('valkyr-legacy-party:' || name)::uuid,name,'PERSON',CURRENT_TIMESTAMP
FROM (SELECT owner AS name FROM "Dog" UNION SELECT custodian FROM "Dog") names
WHERE name IS NOT NULL AND btrim(name) <> '';
UPDATE "Dog" SET "ownerPartyId"=md5('valkyr-legacy-party:' || owner)::uuid
WHERE owner IS NOT NULL AND btrim(owner) <> '';
UPDATE "Dog" SET "custodianPartyId"=md5('valkyr-legacy-party:' || custodian)::uuid
WHERE custodian IS NOT NULL AND btrim(custodian) <> '';
INSERT INTO "Party" (id,name,kind,email,"updatedAt")
SELECT id,name,'PERSON',email,CURRENT_TIMESTAMP FROM "User" WHERE role IN ('TRAINER','CLIENT');
UPDATE "User" SET "partyId"=id WHERE role IN ('TRAINER','CLIENT');
UPDATE "User" SET "partyId"='00000000-0000-4000-8000-000000000001' WHERE role='ADMIN';

ALTER TABLE "User" ADD CONSTRAINT "client_party_required" CHECK (role <> 'CLIENT' OR "partyId" IS NOT NULL);
ALTER TABLE "Dog" ADD CONSTRAINT "sale_publication_complete" CHECK (
  NOT "salePublished" OR ("commercialCategory"='FOR_SALE' AND "salePrice" IS NOT NULL AND "salePrice">0 AND length(btrim(coalesce("saleContact",'')))>0)
);
ALTER TABLE "Dog" ADD CONSTRAINT "sale_price_positive" CHECK ("salePrice" IS NULL OR "salePrice">0);
ALTER TABLE "BreedingPlan" ADD CONSTRAINT "presale_publication_complete" CHECK (
  NOT published OR ("puppyPrice" IS NOT NULL AND "puppyPrice">0 AND length(btrim(coalesce(contact,'')))>0 AND length(btrim(coalesce("publicTitle",'')))>0)
);
CREATE INDEX "Dog_ownerPartyId_idx" ON "Dog"("ownerPartyId");
CREATE INDEX "Dog_assignedTrainerId_idx" ON "Dog"("assignedTrainerId");
CREATE INDEX "Dog_salePublished_commercialCategory_idx" ON "Dog"("salePublished","commercialCategory");

-- CreateIndex
CREATE INDEX "MedicalEntry_dogId_eventDate_idx" ON "MedicalEntry"("dogId", "eventDate");

-- AddForeignKey
ALTER TABLE "MedicalEntry" ADD CONSTRAINT "MedicalEntry_dogId_fkey" FOREIGN KEY ("dogId") REFERENCES "Dog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalEntry" ADD CONSTRAINT "MedicalEntry_recordedBy_fkey" FOREIGN KEY ("recordedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dog" ADD CONSTRAINT "Dog_ownerPartyId_fkey" FOREIGN KEY ("ownerPartyId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dog" ADD CONSTRAINT "Dog_custodianPartyId_fkey" FOREIGN KEY ("custodianPartyId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dog" ADD CONSTRAINT "Dog_assignedTrainerId_fkey" FOREIGN KEY ("assignedTrainerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_customerPartyId_fkey" FOREIGN KEY ("customerPartyId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
