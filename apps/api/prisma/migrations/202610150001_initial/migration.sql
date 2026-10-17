-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPERADMIN', 'ADMIN', 'TRAINER', 'VET', 'FINANCE', 'VIEWER');

-- CreateEnum
CREATE TYPE "Sex" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "AdministrativeStatus" AS ENUM ('OWNED', 'LOANED', 'SOLD', 'RETIRED', 'DECEASED');

-- CreateEnum
CREATE TYPE "WorkStatus" AS ENUM ('TRAINING', 'OPERATIONAL', 'REST', 'TEMPORARILY_UNFIT');

-- CreateEnum
CREATE TYPE "ReproductiveStatus" AS ENUM ('NONE', 'AVAILABLE', 'PLANNED', 'PREGNANT', 'NURSING', 'RETIRED');

-- CreateEnum
CREATE TYPE "Availability" AS ENUM ('AVAILABLE', 'ASSIGNED', 'RESERVED', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "DocumentCategory" AS ENUM ('PHOTO', 'DOCUMENT', 'CLINICAL');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "totpSecret" TEXT,
    "totpPendingSecret" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "csrfHash" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordReset" (
    "id" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "usedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordReset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimit" (
    "key" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Dog" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "registeredName" TEXT,
    "birthDate" DATE,
    "birthDateEstimated" BOOLEAN NOT NULL DEFAULT false,
    "sex" "Sex" NOT NULL,
    "breed" TEXT NOT NULL,
    "coat" TEXT,
    "markings" TEXT,
    "microchip" TEXT,
    "pedigreeNumber" TEXT,
    "registry" TEXT,
    "owner" TEXT,
    "breeder" TEXT,
    "intakeDate" DATE,
    "location" TEXT,
    "custodian" TEXT,
    "specialties" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "administrativeStatus" "AdministrativeStatus" NOT NULL DEFAULT 'OWNED',
    "workStatus" "WorkStatus" NOT NULL DEFAULT 'TRAINING',
    "reproductiveStatus" "ReproductiveStatus" NOT NULL DEFAULT 'NONE',
    "availability" "Availability" NOT NULL DEFAULT 'AVAILABLE',
    "notes" TEXT,
    "photoId" UUID,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Dog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vaccination" (
    "id" UUID NOT NULL,
    "dogId" UUID NOT NULL,
    "product" TEXT NOT NULL,
    "appliedDate" DATE NOT NULL,
    "nextDueDate" DATE,
    "manufacturer" TEXT,
    "batch" TEXT,
    "professional" TEXT,
    "notes" TEXT,
    "recordedBy" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Vaccination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Weight" (
    "id" UUID NOT NULL,
    "dogId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "kg" DOUBLE PRECISION NOT NULL,
    "recordedBy" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Weight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Movement" (
    "id" UUID NOT NULL,
    "dogId" UUID NOT NULL,
    "date" TIMESTAMPTZ(3) NOT NULL,
    "location" TEXT NOT NULL,
    "custodian" TEXT,
    "notes" TEXT,
    "recordedBy" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Movement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingSession" (
    "id" UUID NOT NULL,
    "dogId" UUID NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "discipline" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "location" TEXT,
    "exercises" TEXT,
    "material" TEXT,
    "difficulty" TEXT,
    "successes" INTEGER,
    "falseAlerts" INTEGER,
    "misses" INTEGER,
    "score" DOUBLE PRECISION,
    "notes" TEXT,
    "trainerId" UUID NOT NULL,
    "trainerName" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" UUID NOT NULL,
    "dogId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "location" TEXT,
    "professional" TEXT,
    "notes" TEXT,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "remindBeforeHours" INTEGER NOT NULL DEFAULT 24,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" UUID NOT NULL,
    "dogId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "category" "DocumentCategory" NOT NULL,
    "uploadedBy" UUID NOT NULL,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reminder" (
    "id" UUID NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "dueAt" TIMESTAMPTZ(3) NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "ReminderStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lockedAt" TIMESTAMPTZ(3),
    "lastError" TEXT,
    "sentAt" TIMESTAMPTZ(3),
    "emailSentAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "reminderId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "actorName" TEXT,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "dogId" UUID,
    "action" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "origin" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordReset_tokenHash_key" ON "PasswordReset"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "Dog_code_key" ON "Dog"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Dog_microchip_key" ON "Dog"("microchip");

-- CreateIndex
CREATE INDEX "Dog_archivedAt_workStatus_idx" ON "Dog"("archivedAt", "workStatus");

-- CreateIndex
CREATE INDEX "Dog_location_idx" ON "Dog"("location");

-- CreateIndex
CREATE INDEX "Vaccination_dogId_appliedDate_idx" ON "Vaccination"("dogId", "appliedDate");

-- CreateIndex
CREATE INDEX "Vaccination_nextDueDate_idx" ON "Vaccination"("nextDueDate");

-- CreateIndex
CREATE INDEX "Weight_dogId_date_idx" ON "Weight"("dogId", "date");

-- CreateIndex
CREATE INDEX "Movement_dogId_date_idx" ON "Movement"("dogId", "date");

-- CreateIndex
CREATE INDEX "TrainingSession_dogId_occurredAt_idx" ON "TrainingSession"("dogId", "occurredAt");

-- CreateIndex
CREATE INDEX "Appointment_dogId_startsAt_idx" ON "Appointment"("dogId", "startsAt");

-- CreateIndex
CREATE INDEX "Appointment_status_startsAt_idx" ON "Appointment"("status", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "Document_storageKey_key" ON "Document"("storageKey");

-- CreateIndex
CREATE INDEX "Document_dogId_archivedAt_idx" ON "Document"("dogId", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Reminder_dedupeKey_key" ON "Reminder"("dedupeKey");

-- CreateIndex
CREATE INDEX "Reminder_status_dueAt_idx" ON "Reminder"("status", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_reminderId_key" ON "Notification"("reminderId");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_dogId_createdAt_idx" ON "AuditLog"("dogId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordReset" ADD CONSTRAINT "PasswordReset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vaccination" ADD CONSTRAINT "Vaccination_dogId_fkey" FOREIGN KEY ("dogId") REFERENCES "Dog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Weight" ADD CONSTRAINT "Weight_dogId_fkey" FOREIGN KEY ("dogId") REFERENCES "Dog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Movement" ADD CONSTRAINT "Movement_dogId_fkey" FOREIGN KEY ("dogId") REFERENCES "Dog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingSession" ADD CONSTRAINT "TrainingSession_dogId_fkey" FOREIGN KEY ("dogId") REFERENCES "Dog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_dogId_fkey" FOREIGN KEY ("dogId") REFERENCES "Dog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_dogId_fkey" FOREIGN KEY ("dogId") REFERENCES "Dog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_reminderId_fkey" FOREIGN KEY ("reminderId") REFERENCES "Reminder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Append-only audit protection: application writes may only append.
CREATE FUNCTION reject_audit_modification() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog is append-only';
END;
$$;
CREATE TRIGGER audit_log_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON "AuditLog"
  FOR EACH STATEMENT EXECUTE FUNCTION reject_audit_modification();

-- Integrity rules remain enforced for all writers, including maintenance clients.
ALTER TABLE "Weight" ADD CONSTRAINT "Weight_kg_check" CHECK (kg > 0 AND kg <= 200);
ALTER TABLE "TrainingSession" ADD CONSTRAINT "TrainingSession_duration_check" CHECK ("durationMinutes" BETWEEN 1 AND 1440);
ALTER TABLE "TrainingSession" ADD CONSTRAINT "TrainingSession_score_check" CHECK (score IS NULL OR score BETWEEN 0 AND 100);
ALTER TABLE "TrainingSession" ADD CONSTRAINT "TrainingSession_counts_check" CHECK ((successes IS NULL OR successes >= 0) AND ("falseAlerts" IS NULL OR "falseAlerts" >= 0) AND (misses IS NULL OR misses >= 0));
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_reminder_check" CHECK ("remindBeforeHours" BETWEEN 0 AND 720);
ALTER TABLE "Document" ADD CONSTRAINT "Document_size_check" CHECK (size > 0 AND size <= 10485760);
ALTER TABLE "Vaccination" ADD CONSTRAINT "Vaccination_dates_check" CHECK ("nextDueDate" IS NULL OR "nextDueDate" > "appliedDate");
ALTER TABLE "Dog" ADD CONSTRAINT "Dog_reproduction_check" CHECK (sex = 'FEMALE' OR "reproductiveStatus" NOT IN ('PREGNANT', 'NURSING'));
ALTER TABLE "Dog" ADD CONSTRAINT "Dog_deceased_check" CHECK ("administrativeStatus" <> 'DECEASED' OR (availability = 'UNAVAILABLE' AND "workStatus" <> 'OPERATIONAL'));
