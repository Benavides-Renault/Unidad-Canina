ALTER TABLE "Dog" ADD CONSTRAINT "Dog_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "Document"(id) ON DELETE RESTRICT;
ALTER TABLE "Vaccination" ADD CONSTRAINT "Vaccination_recordedBy_fkey" FOREIGN KEY ("recordedBy") REFERENCES "User"(id) ON DELETE RESTRICT;
ALTER TABLE "Weight" ADD CONSTRAINT "Weight_recordedBy_fkey" FOREIGN KEY ("recordedBy") REFERENCES "User"(id) ON DELETE RESTRICT;
ALTER TABLE "Movement" ADD CONSTRAINT "Movement_recordedBy_fkey" FOREIGN KEY ("recordedBy") REFERENCES "User"(id) ON DELETE RESTRICT;
ALTER TABLE "TrainingSession" ADD CONSTRAINT "TrainingSession_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "User"(id) ON DELETE RESTRICT;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"(id) ON DELETE RESTRICT;
ALTER TABLE "Document" ADD CONSTRAINT "Document_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "User"(id) ON DELETE RESTRICT;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"(id) ON DELETE RESTRICT;

CREATE FUNCTION validate_dog_photo_ownership() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."photoId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "Document" WHERE id = NEW."photoId" AND "dogId" = NEW.id AND category = 'PHOTO' AND "archivedAt" IS NULL
  ) THEN
    RAISE EXCEPTION 'Main photo must be an active photo of the same dog';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER dog_photo_ownership BEFORE INSERT OR UPDATE OF "photoId" ON "Dog"
  FOR EACH ROW EXECUTE FUNCTION validate_dog_photo_ownership();
