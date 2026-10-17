# Alcance de la instalación en esta PC

El destino elegido sigue siendo Windows local. Los resultados ejecutados se registran en [TEST_REPORT.md](TEST_REPORT.md).

| Fase                         | Funciones disponibles                                                                                                                                                                                                                                                                               |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 · Fundamentos              | Usuarios, tres roles, búsqueda de cuentas, cookies/CSRF, auditoría, MFA opcional u obligatorio y ocho códigos de recuperación de un solo uso.                                                                                                                                                       |
| 1 · Operación                | Expedientes, propietarios/custodios, entrenadores asignados, clínica estructurada, alergias, correcciones versionadas, vacunas, pesos, citas, objetivos/evaluaciones, comprobantes por registro y certificados con plantillas. Calendario día/semana/mes con preferencias persistentes.             |
| 2 · Contratos                | Instituciones, contactos editables, contratos/versiones, renovación enlazada, cláusulas desde plantilla, archivos, asignaciones con control de solapamiento, servicios e informes.                                                                                                                  |
| 3 · Crianza y administración | Árbol genealógico interactivo, documentación de crianza, cruces, gestaciones, camadas/cachorros, apartados y entregas. Proveedores, cuentas, pagos/reintegros, conciliación, flujo por fecha, cierres mensuales inmutables, exportaciones e inventario.                                             |
| 4 · Continuidad local        | Roles PostgreSQL separados, monitor, respaldo diario coherente y cifrado, restauración aislada, cuota local, retención de archivos rechazados, integración opcional con ClamAV, preferencias de correo y Web Push con consentimiento/reintentos. Adaptador de respaldo S3 hacia una copia portable. |

Los entrenadores sólo agregan salud y entrenamiento a sus asignados. Los clientes consultan el historial completo de sus propios perros y la galería administrada. La custodia no concede acceso al cliente.

## Configuración dependiente del destino

- SMTP y preferencias: probados con receptor local. Falta proveedor y credenciales de correo real.
- Web Push y su cola: probados con transporte simulado. Activación mediante claves VAPID, contacto técnico y permiso de cada navegador; recepción externa pendiente de configurar el servicio.
- S3: snapshot y exportación de objetos probados con cliente inyectado; bucket real, permisos y cuotas requieren validación en ese destino. Esta PC usa archivos locales.
- ClamAV: integración y fallo cerrado probados; no se instaló un motor antivirus. Sin él se validan formato, tamaño e integridad y se rechaza la firma de prueba EICAR.
- Servidor, HTTPS/LAN, Docker/WSL2, teléfonos físicos, copia fuera de esta PC y evaluaciones profesionales independientes se realizarán al elegir ese entorno. No se presentan como verificados.

Los datos y las fotos de ejemplo están documentados en [DEMO_ACCESOS.md](DEMO_ACCESOS.md). La interfaz omite carteles de demo por solicitud del usuario; la configuración de prueba sigue separada. No hay prescripción automática, cálculo clínico genético, conversión automática de monedas ni factura fiscal.
