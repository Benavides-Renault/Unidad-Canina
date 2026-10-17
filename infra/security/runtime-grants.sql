-- Ejecutar en la base destino con su propietario, mediante psql -v runtime_role=ROL.
-- El rol de conexión debe existir y no ser propietario, superusuario ni miembro de uno.
GRANT USAGE ON SCHEMA public TO :"runtime_role";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO :"runtime_role";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO :"runtime_role";
REVOKE UPDATE, DELETE ON "AuditLog", "ContractVersion", "Payment", "StockMovement", "GoalEvaluation", "MedicalRevision", "RecordAttachment", "PaymentReconciliation", "FinancialClose" FROM :"runtime_role";
REVOKE ALL ON "_prisma_migrations" FROM :"runtime_role";
-- No se concede TRUNCATE, CREATE, propiedad ni modificación de funciones/triggers.
-- Repetir después de cada migración que cree tablas; revisar nuevas tablas inmutables.
