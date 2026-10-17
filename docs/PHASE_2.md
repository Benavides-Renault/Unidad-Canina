# Fase 2 — Contratos y servicios

Verificada el 15 de octubre de 2026 en la base aislada `valkyr_test_1792110140481`.

- Instituciones y contactos; contratos con importes decimales CRC/USD, vigencia, responsables y condiciones privadas.
- Versiones de datos inmutables y control de revisión para evitar sobrescribir cambios simultáneos.
- Documentos PDF/PNG/JPEG privados, hasta 10 MiB, con versiones, checksum y permisos de descarga.
- Asignaciones temporales muchos-a-muchos. Dos solicitudes simultáneas incompatibles producen una aceptación y un conflicto; administración puede justificar una excepción auditada. El retiro conserva el historial.
- Servicios y turnos. Un entrenador sólo consulta sus asignaciones y registra servicios dentro de sus periodos autorizados. No recibe montos ni cláusulas.
- Recordatorios persistentes de vencimiento para administración y finanzas; informe PDF que excluye montos, cláusulas y notas internas.

Pruebas: 7 unitarias, 16 escenarios API (18 nodos TAP) y 5 flujos Playwright, todos aprobados. Se comprobó por extracción que el PDF omite datos privados y se revisó su página renderizada. También se corrigió el menú para mantener accesibles navegación y cierre de sesión en ventanas pequeñas.

La información del listado y los archivos se persisten en PostgreSQL y almacenamiento privado. Los formularios usan la misma API protegida que las pruebas. Las pruebas no insertan información sintética en la base de uso.

Ampliación: contactos editables, cláusulas desde plantillas y renovaciones como contratos nuevos enlazados al anterior. La renovación exige revisión vigente y fecha posterior al cierre anterior; no duplica asignaciones. Los certificados se gestionan por perro. El detalle conserva los límites de 50 versiones y 100 servicios recientes; informe de hasta 1000 servicios por periodo. Los contratos administrativos siguen restringidos al administrador. La entrega local y servicios externos se detallan en ROADMAP.md y TEST_REPORT.md.
