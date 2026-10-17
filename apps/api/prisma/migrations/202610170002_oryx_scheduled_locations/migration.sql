-- Scheduled locations remain editable. Historical events and issued documents retain their evidence.
UPDATE "Appointment"
SET location = replace(location, 'VALKYR', 'ORYX K9'), "updatedAt" = NOW()
WHERE status = 'SCHEDULED' AND location LIKE '%VALKYR%';

INSERT INTO "AuditLog" (id, "actorName", entity, action, summary)
VALUES (gen_random_uuid(), 'Actualización de instalación', 'System', 'BRAND_UPDATE',
        'Nombre de la unidad actualizado en las ubicaciones de las citas programadas.');
