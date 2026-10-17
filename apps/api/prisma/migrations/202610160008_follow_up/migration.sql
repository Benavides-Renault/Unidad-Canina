CREATE TABLE "TrainingPlan" (
  "id" UUID PRIMARY KEY, "dogId" UUID NOT NULL REFERENCES "Dog"("id") ON DELETE RESTRICT,
  "title" TEXT NOT NULL, "discipline" TEXT NOT NULL, "startDate" DATE NOT NULL, "dueDate" DATE NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE' CHECK ("status" IN ('ACTIVE','COMPLETED')),
  "revision" INTEGER NOT NULL DEFAULT 1, "recordedBy" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "archivedAt" TIMESTAMPTZ(3),
  CHECK ("dueDate" >= "startDate")
);
CREATE INDEX "TrainingPlan_dogId_archivedAt_idx" ON "TrainingPlan"("dogId","archivedAt");
CREATE INDEX "TrainingPlan_dueDate_status_idx" ON "TrainingPlan"("dueDate","status");
CREATE TABLE "TrainingGoal" (
  "id" UUID PRIMARY KEY, "planId" UUID NOT NULL REFERENCES "TrainingPlan"("id") ON DELETE RESTRICT,
  "title" TEXT NOT NULL, "criterion" TEXT NOT NULL, "targetScore" INTEGER NOT NULL CHECK ("targetScore" BETWEEN 1 AND 100), "position" INTEGER NOT NULL
);
CREATE INDEX "TrainingGoal_planId_idx" ON "TrainingGoal"("planId");
CREATE TABLE "GoalEvaluation" (
  "id" UUID PRIMARY KEY, "goalId" UUID NOT NULL REFERENCES "TrainingGoal"("id") ON DELETE RESTRICT,
  "eventDate" DATE NOT NULL, "score" INTEGER NOT NULL CHECK ("score" BETWEEN 0 AND 100), "notes" TEXT NOT NULL,
  "recordedBy" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "GoalEvaluation_goalId_eventDate_createdAt_idx" ON "GoalEvaluation"("goalId","eventDate","createdAt");
CREATE TABLE "Certification" (
  "id" UUID PRIMARY KEY, "dogId" UUID NOT NULL REFERENCES "Dog"("id") ON DELETE RESTRICT,
  "title" TEXT NOT NULL, "issuer" TEXT NOT NULL, "reference" TEXT, "issueDate" DATE NOT NULL, "expiresDate" DATE,
  "notes" TEXT, "recordedBy" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "archivedAt" TIMESTAMPTZ(3),
  CHECK ("expiresDate" IS NULL OR "expiresDate" > "issueDate")
);
CREATE INDEX "Certification_dogId_archivedAt_idx" ON "Certification"("dogId","archivedAt");
CREATE INDEX "Certification_expiresDate_idx" ON "Certification"("expiresDate");
CREATE FUNCTION "reject_goal_evaluation_mutation"() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'Las evaluaciones son inmutables. Agregue una nueva evaluación.'; END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "goal_evaluation_immutable" BEFORE UPDATE OR DELETE ON "GoalEvaluation"
  FOR EACH ROW EXECUTE FUNCTION "reject_goal_evaluation_mutation"();
