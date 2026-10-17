-- CreateEnum
CREATE TYPE "BreedingPlanStatus" AS ENUM ('PLANNED', 'MATED', 'CONFIRMED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('ACTIVE', 'DELIVERED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AccountDirection" AS ENUM ('PAYABLE', 'RECEIVABLE');

-- CreateEnum
CREATE TYPE "PaymentKind" AS ENUM ('PAYMENT', 'REFUND');

-- CreateEnum
CREATE TYPE "StockKind" AS ENUM ('IN', 'OUT', 'DISPOSAL');

-- AlterTable
ALTER TABLE "Dog" ADD COLUMN     "isPuppy" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "litterId" UUID;

-- CreateTable
CREATE TABLE "BreedingProfile" (
    "dogId" UUID NOT NULL,
    "sireId" UUID,
    "damId" UUID,
    "pedigreeSource" TEXT,
    "pedigreeQuality" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "healthNotes" TEXT,
    "professional" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "BreedingProfile_pkey" PRIMARY KEY ("dogId")
);

-- CreateTable
CREATE TABLE "BreedingEvent" (
    "id" UUID NOT NULL,
    "dogId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "eventDate" DATE NOT NULL,
    "professional" TEXT,
    "notes" TEXT NOT NULL,
    "recordedBy" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BreedingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BreedingPlan" (
    "id" UUID NOT NULL,
    "damId" UUID NOT NULL,
    "sireId" UUID NOT NULL,
    "plannedDate" DATE NOT NULL,
    "matingDate" DATE,
    "windowStart" DATE,
    "windowEnd" DATE,
    "estimationMethod" TEXT,
    "professional" TEXT,
    "notes" TEXT,
    "status" "BreedingPlanStatus" NOT NULL DEFAULT 'PLANNED',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "BreedingPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Litter" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "damId" UUID NOT NULL,
    "sireId" UUID NOT NULL,
    "planId" UUID,
    "birthDate" DATE NOT NULL,
    "liveBorn" INTEGER NOT NULL,
    "stillBorn" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Litter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reservation" (
    "id" UUID NOT NULL,
    "litterId" UUID NOT NULL,
    "dogId" UUID,
    "customer" TEXT NOT NULL,
    "contact" TEXT,
    "reservedDate" DATE NOT NULL,
    "expiresDate" DATE NOT NULL,
    "conditions" TEXT,
    "status" "ReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "closedDate" DATE,
    "closeReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" UUID NOT NULL,
    "direction" "AccountDirection" NOT NULL,
    "party" TEXT NOT NULL,
    "concept" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "costCenter" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" "Currency" NOT NULL,
    "exchangeRate" DECIMAL(18,6),
    "exchangeDate" DATE,
    "dueDate" DATE NOT NULL,
    "issueDate" DATE NOT NULL,
    "cancelledAt" TIMESTAMPTZ(3),
    "cancelReason" TEXT,
    "notes" TEXT,
    "dogId" UUID,
    "litterId" UUID,
    "contractId" UUID,
    "reservationId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "kind" "PaymentKind" NOT NULL DEFAULT 'PAYMENT',
    "amount" DECIMAL(18,2) NOT NULL,
    "paidDate" DATE NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "requestId" UUID NOT NULL,
    "recordedBy" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountFile" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "uploadedBy" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "minimum" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockLot" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "batch" TEXT NOT NULL,
    "expiresDate" DATE,
    "quantity" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "unitCost" DECIMAL(18,2) NOT NULL,
    "currency" "Currency" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockLot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" UUID NOT NULL,
    "lotId" UUID NOT NULL,
    "kind" "StockKind" NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "movementDate" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "area" TEXT,
    "dogId" UUID,
    "requestId" UUID NOT NULL,
    "recordedBy" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BreedingEvent_dogId_eventDate_idx" ON "BreedingEvent"("dogId", "eventDate");

-- CreateIndex
CREATE INDEX "BreedingPlan_status_plannedDate_idx" ON "BreedingPlan"("status", "plannedDate");

-- CreateIndex
CREATE UNIQUE INDEX "Litter_code_key" ON "Litter"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Litter_planId_key" ON "Litter"("planId");

-- CreateIndex
CREATE INDEX "Litter_birthDate_idx" ON "Litter"("birthDate");

-- CreateIndex
CREATE INDEX "Reservation_litterId_status_idx" ON "Reservation"("litterId", "status");

-- CreateIndex
CREATE INDEX "Reservation_dogId_status_idx" ON "Reservation"("dogId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Account_reservationId_key" ON "Account"("reservationId");

-- CreateIndex
CREATE INDEX "Account_direction_dueDate_idx" ON "Account"("direction", "dueDate");

-- CreateIndex
CREATE INDEX "Account_dogId_idx" ON "Account"("dogId");

-- CreateIndex
CREATE INDEX "Account_litterId_idx" ON "Account"("litterId");

-- CreateIndex
CREATE INDEX "Account_contractId_idx" ON "Account"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_requestId_key" ON "Payment"("requestId");

-- CreateIndex
CREATE INDEX "Payment_accountId_paidDate_idx" ON "Payment"("accountId", "paidDate");

-- CreateIndex
CREATE UNIQUE INDEX "AccountFile_storageKey_key" ON "AccountFile"("storageKey");

-- CreateIndex
CREATE INDEX "AccountFile_accountId_idx" ON "AccountFile"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");

-- CreateIndex
CREATE INDEX "StockLot_expiresDate_idx" ON "StockLot"("expiresDate");

-- CreateIndex
CREATE UNIQUE INDEX "StockLot_productId_batch_key" ON "StockLot"("productId", "batch");

-- CreateIndex
CREATE UNIQUE INDEX "StockMovement_requestId_key" ON "StockMovement"("requestId");

-- CreateIndex
CREATE INDEX "StockMovement_lotId_movementDate_idx" ON "StockMovement"("lotId", "movementDate");

-- AddForeignKey
ALTER TABLE "Dog" ADD CONSTRAINT "Dog_litterId_fkey" FOREIGN KEY ("litterId") REFERENCES "Litter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreedingProfile" ADD CONSTRAINT "BreedingProfile_dogId_fkey" FOREIGN KEY ("dogId") REFERENCES "Dog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreedingProfile" ADD CONSTRAINT "BreedingProfile_sireId_fkey" FOREIGN KEY ("sireId") REFERENCES "Dog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreedingProfile" ADD CONSTRAINT "BreedingProfile_damId_fkey" FOREIGN KEY ("damId") REFERENCES "Dog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreedingEvent" ADD CONSTRAINT "BreedingEvent_dogId_fkey" FOREIGN KEY ("dogId") REFERENCES "Dog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreedingEvent" ADD CONSTRAINT "BreedingEvent_recordedBy_fkey" FOREIGN KEY ("recordedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreedingPlan" ADD CONSTRAINT "BreedingPlan_damId_fkey" FOREIGN KEY ("damId") REFERENCES "Dog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreedingPlan" ADD CONSTRAINT "BreedingPlan_sireId_fkey" FOREIGN KEY ("sireId") REFERENCES "Dog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Litter" ADD CONSTRAINT "Litter_damId_fkey" FOREIGN KEY ("damId") REFERENCES "Dog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Litter" ADD CONSTRAINT "Litter_sireId_fkey" FOREIGN KEY ("sireId") REFERENCES "Dog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Litter" ADD CONSTRAINT "Litter_planId_fkey" FOREIGN KEY ("planId") REFERENCES "BreedingPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_litterId_fkey" FOREIGN KEY ("litterId") REFERENCES "Litter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_dogId_fkey" FOREIGN KEY ("dogId") REFERENCES "Dog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_dogId_fkey" FOREIGN KEY ("dogId") REFERENCES "Dog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_litterId_fkey" FOREIGN KEY ("litterId") REFERENCES "Litter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_recordedBy_fkey" FOREIGN KEY ("recordedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountFile" ADD CONSTRAINT "AccountFile_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountFile" ADD CONSTRAINT "AccountFile_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLot" ADD CONSTRAINT "StockLot_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "StockLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_dogId_fkey" FOREIGN KEY ("dogId") REFERENCES "Dog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_recordedBy_fkey" FOREIGN KEY ("recordedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Business invariants also enforced by PostgreSQL.
ALTER TABLE "BreedingProfile" ADD CONSTRAINT "Profile_quality" CHECK ("pedigreeQuality" IN ('UNKNOWN','REPORTED','DOCUMENTED') AND "dogId" IS DISTINCT FROM "sireId" AND "dogId" IS DISTINCT FROM "damId");
ALTER TABLE "BreedingPlan" ADD CONSTRAINT "Plan_window" CHECK ("damId" <> "sireId" AND (("windowStart" IS NULL AND "windowEnd" IS NULL) OR ("windowStart" IS NOT NULL AND "windowEnd" IS NOT NULL AND "windowEnd">="windowStart")));
ALTER TABLE "Litter" ADD CONSTRAINT "Litter_counts" CHECK ("liveBorn" BETWEEN 0 AND 30 AND "stillBorn" BETWEEN 0 AND 30 AND "damId"<>"sireId");
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_dates" CHECK ("expiresDate">="reservedDate" AND ("closedDate" IS NULL OR "closedDate">="reservedDate"));
CREATE UNIQUE INDEX "Reservation_one_puppy" ON "Reservation" ("dogId") WHERE "dogId" IS NOT NULL AND status IN ('ACTIVE','DELIVERED');
ALTER TABLE "Account" ADD CONSTRAINT "Account_amount_dates" CHECK (amount>0 AND "dueDate">="issueDate" AND (("exchangeRate" IS NULL AND "exchangeDate" IS NULL) OR ("exchangeRate">0 AND "exchangeDate" IS NOT NULL)));
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_positive" CHECK (amount>0);
ALTER TABLE "Product" ADD CONSTRAINT "Product_minimum" CHECK (minimum>=0);
ALTER TABLE "StockLot" ADD CONSTRAINT "StockLot_nonnegative" CHECK (quantity>=0 AND "unitCost">=0);
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_positive" CHECK (quantity>0);
ALTER TABLE "AccountFile" ADD CONSTRAINT "AccountFile_size" CHECK (size>0 AND size<=10485760);
CREATE TRIGGER payment_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON "Payment" FOR EACH STATEMENT EXECUTE FUNCTION reject_audit_modification();
CREATE TRIGGER stock_movement_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON "StockMovement" FOR EACH STATEMENT EXECUTE FUNCTION reject_audit_modification();
