ALTER TYPE "DocumentCategory" ADD VALUE 'TRAINING';
ALTER TYPE "DocumentCategory" ADD VALUE 'BREEDING';
ALTER TABLE "User" ADD COLUMN "recoveryHashes" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "MedicalEntry" ADD COLUMN "diagnosis" TEXT, ADD COLUMN "clinicalStatus" TEXT,
 ADD COLUMN "allergen" TEXT, ADD COLUMN "medication" TEXT, ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "MedicalEntry" DROP CONSTRAINT IF EXISTS "MedicalEntry_kind_check";
ALTER TABLE "MedicalEntry" ADD CONSTRAINT "MedicalEntry_kind_check" CHECK (kind IN ('OBSERVATION','CONSULTATION','TREATMENT','DEWORMING','ALLERGY','INJURY','SURGERY','LAB'));
ALTER TABLE "Certification" ADD COLUMN "templateSnapshot" JSONB;
ALTER TABLE "Contract" ADD COLUMN "renewedFromId" UUID REFERENCES "Contract"(id) ON DELETE RESTRICT;
CREATE TABLE "MedicalRevision" (
 "id" UUID PRIMARY KEY, "entryId" UUID NOT NULL REFERENCES "MedicalEntry"(id) ON DELETE RESTRICT,
 "revision" INTEGER NOT NULL, "snapshot" JSONB NOT NULL, "reason" TEXT NOT NULL,
 "recordedBy" UUID NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "MedicalRevision_entryId_revision_key" UNIQUE ("entryId","revision")
);
INSERT INTO "MedicalRevision" (id,"entryId",revision,snapshot,reason,"recordedBy","createdAt")
 SELECT gen_random_uuid(),id,revision,to_jsonb(m),'Importación del registro anterior al versionado',"recordedBy","createdAt" FROM "MedicalEntry" m;
CREATE TABLE "RecordAttachment" (
 "id" UUID PRIMARY KEY, "documentId" UUID NOT NULL UNIQUE REFERENCES "Document"(id) ON DELETE RESTRICT,
 "vaccinationId" UUID REFERENCES "Vaccination"(id) ON DELETE RESTRICT,
 "trainingSessionId" UUID REFERENCES "TrainingSession"(id) ON DELETE RESTRICT,
 "evaluationId" UUID REFERENCES "GoalEvaluation"(id) ON DELETE RESTRICT,
 "medicalEntryId" UUID REFERENCES "MedicalEntry"(id) ON DELETE RESTRICT,
 "certificationId" UUID REFERENCES "Certification"(id) ON DELETE RESTRICT,
 "breedingDogId" UUID REFERENCES "Dog"(id) ON DELETE RESTRICT,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK (num_nonnulls("vaccinationId","trainingSessionId","evaluationId","medicalEntryId","certificationId","breedingDogId")=1)
);
CREATE TABLE "CertificateTemplate" (
 "id" UUID PRIMARY KEY, "name" TEXT NOT NULL, "kind" TEXT NOT NULL CHECK (kind IN ('TRAINING','BREEDING','CONTRACT')),
 "title" TEXT NOT NULL, "issuer" TEXT NOT NULL, "body" TEXT NOT NULL,
 "revision" INTEGER NOT NULL DEFAULT 1, "archivedAt" TIMESTAMPTZ(3), "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "UserPreference" (
 "userId" UUID PRIMARY KEY REFERENCES "User"(id) ON DELETE RESTRICT,
 "emailEnabled" BOOLEAN NOT NULL DEFAULT true, "pushEnabled" BOOLEAN NOT NULL DEFAULT false,
 "calendarView" TEXT NOT NULL DEFAULT 'month' CHECK ("calendarView" IN ('day','week','month')),
 "calendarType" TEXT NOT NULL DEFAULT 'ALL'
);
CREATE TABLE "Supplier" (
 "id" UUID PRIMARY KEY, "name" TEXT NOT NULL, "taxId" TEXT, "contact" TEXT, "email" TEXT, "phone" TEXT, "notes" TEXT,
 "active" BOOLEAN NOT NULL DEFAULT true, "revision" INTEGER NOT NULL DEFAULT 1, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE "Account" ADD COLUMN "supplierId" UUID REFERENCES "Supplier"(id) ON DELETE RESTRICT;
CREATE TABLE "PaymentReconciliation" (
 "id" UUID PRIMARY KEY, "paymentId" UUID NOT NULL UNIQUE REFERENCES "Payment"(id) ON DELETE RESTRICT,
 "statementReference" TEXT NOT NULL, "notes" TEXT,
 "recordedBy" UUID NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "FinancialClose" (
 "id" UUID PRIMARY KEY, "month" TEXT NOT NULL UNIQUE CHECK (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
 "endDate" DATE NOT NULL, "snapshot" JSONB NOT NULL, "notes" TEXT NOT NULL,
 "recordedBy" UUID NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE FUNCTION "reject_historical_mutation"() RETURNS trigger AS $$
 BEGIN RAISE EXCEPTION 'El historial es inmutable.'; END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "medical_revision_immutable" BEFORE UPDATE OR DELETE ON "MedicalRevision" FOR EACH ROW EXECUTE FUNCTION "reject_historical_mutation"();
CREATE TRIGGER "record_attachment_immutable" BEFORE UPDATE OR DELETE ON "RecordAttachment" FOR EACH ROW EXECUTE FUNCTION "reject_historical_mutation"();
CREATE TRIGGER "reconciliation_immutable" BEFORE UPDATE OR DELETE ON "PaymentReconciliation" FOR EACH ROW EXECUTE FUNCTION "reject_historical_mutation"();
CREATE TRIGGER "financial_close_immutable" BEFORE UPDATE OR DELETE ON "FinancialClose" FOR EACH ROW EXECUTE FUNCTION "reject_historical_mutation"();
