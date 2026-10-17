# Verificación de la entrega local actual

Ampliación de acceso compartido del **16 de octubre de 2026**: nueve pruebas unitarias y de proxy aprobadas; TypeScript API/web y ESLint sin errores. Se verifica que el enlace exige una invitación aleatoria, rechaza otros orígenes, conserva CSRF/cookies y caduca. El dominio externo responde y su API devuelve 403 sin invitación. Con autorización expresa del propietario se verificaron los accesos de administrador y cliente a través del túnel HTTPS, módulos administrativos, fotos, preventas y vista móvil, sin errores de página; evidencia privada en `.local/share-verification.json`. La revisión de publicación comprobó 188 archivos y el commit anterior contra rutas privadas, patrones de credenciales y los secretos de la configuración local, sin coincidencias. `next-env.d.ts` se regenera al comprobar tipos y no se publica.

Entrega del **16 de octubre de 2026, Costa Rica**. Migraciones 001–010; compilación activa `.next-release-1792131553251`; base `valkyr_demo_1792125220047`. Las diez cuentas de prueba usan `1234`. Se conservaron la base original y los respaldos anteriores. La última comprobación de TypeScript API/web y ESLint terminó sin errores.

| Comprobación de esta entrega                 | Resultado                                                                                                                     |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Compilación de producción API/web            | PASS                                                                                                                          |
| Unitarias                                    | 7 de 7 PASS                                                                                                                   |
| API / PostgreSQL                             | 55 escenarios PASS en 8 agrupadores; 63 nodos TAP en total                                                                    |
| Navegador aislado                            | 15 de 15 PASS                                                                                                                 |
| Navegador sobre instalación activa           | 2 de 2 PASS; administración, entrenador, cliente móvil y preventa                                                             |
| Acceso y aislamiento                         | Las 10 cuentas ingresan; propiedad y asignaciones verificadas contra la base; rol de aplicación sin privilegios de estructura |
| Exportaciones y lectura concurrente          | PDF/CSV y 100 consultas en grupos de 10; p95 local 56 ms                                                                      |
| Cifrado y restauración aislada               | 45 tablas y 11 archivos conservados; clave incorrecta y contenido cifrado alterado rechazados                                 |
| Adaptador de copia S3                        | PASS con cliente de objetos inyectado; sin conexión a un bucket real                                                          |
| Restauración del respaldo cifrado activo     | 40 tablas de negocio exactas, 43 archivos comprobados, 10 migraciones, credencial e historiales protegidos conservados        |
| Reinicio completo de PostgreSQL y aplicación | PASS: 40 tablas idénticas, 30 perros, acceso, trabajador y respaldo saludables                                                |

La batería completa aislada usó `valkyr_test_1792131185516` y puertos 4001/3100. La restauración cifrada de integración creó `valkyr_restore_crypto_1792131014599`; la copia de la instalación activa se restauró en `valkyr_restore_demo_1792131903285`. No se sustituyó la base de uso durante estas recuperaciones.

La cobertura añadida incluye correcciones clínicas con control de revisión, comprobantes vinculados y permisos al archivar, plantillas y certificados, renovación contractual, proveedores, conciliación y cierre mensual, códigos MFA de un solo uso, preferencias de calendario, cola push con reintentos y suscripciones revocadas, cuotas y retención de cargas rechazadas. Las notificaciones se verificaron con receptor SMTP local y transporte push simulado.

La instalación contiene 30 perros con fotografías de Pexels, tres camadas, sesiones y planes de entrenamiento, controles clínicos, contratos, proveedores e inventario. Todas las publicaciones de venta y preventa usan **María Vargas · +123456789**. Se retiraron los avisos provisionales de la interfaz y se conservó la procedencia de las imágenes en `assets/demo`.

Antes de activar se creó `.local/backups/pre-update-1792131479646`; antes de normalizar el contenido se creó `.local/backups/pre-content-1792131860041`. La copia cifrada activa verificada está en `.local/backups/valkyr_demo_1792125220047/encrypted-1792131863033`. Evidencias: `.local/demo-smoke.json`, `.local/encrypted-backup-result.json`, `.local/demo-recovery.json`, `.local/demo-restart-result.json` y capturas `.local/demo-*.png`.

Los primeros intentos detectaron un API de prueba desactualizado, supuestos de paginación y calendario en pruebas, una etiqueta duplicada y diferencias entre el entorno local del API y el build web. Se corrigieron y se repitieron las baterías completas con los resultados anteriores. El arranque también se ajustó para cerrar primero los servicios y esperar la disponibilidad de PostgreSQL; el último reinicio fue limpio. Los intentos fallidos no se cuentan como aprobados.

El alcance verificado es esta PC. SMTP externo, recepción push real, S3 real, un motor ClamAV instalado, teléfonos físicos y despliegue externo requieren su configuración y comprobación, según [PHASE_4_LOCAL.md](PHASE_4_LOCAL.md) y [ROADMAP.md](ROADMAP.md). Los resultados no garantizan ausencia absoluta de defectos.

## Informe anterior: consolidación y demostración (conservado como historial)

Entrega local del **15 de octubre de 2026, Costa Rica**. Migraciones 001–008; compilación activa `.next-release-1792125595191`; base `valkyr_demo_1792125220047`. Los datos anteriores se conservaron y respaldaron antes del cambio.

| Comprobación de esta entrega                   | Resultado                                                                                                                                                  |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript API/web, ESLint y compilación final | PASS                                                                                                                                                       |
| Unitarias                                      | 7 PASS                                                                                                                                                     |
| API / PostgreSQL, batería final                | 39 escenarios; 45 nodos TAP incluyendo 6 agrupadores, todos PASS                                                                                           |
| Navegador aislado, batería final               | 12 de 12 PASS                                                                                                                                              |
| Navegador sobre demostración activa            | 2 de 2 PASS; administración, entrenador, cliente móvil y preventa                                                                                          |
| Bootstrap y migraciones de usuario/roles       | PASS en bases aisladas                                                                                                                                     |
| Copia con escritores pausados y restauración   | PASS: 36 tablas, 10 archivos; saldos y triggers; corrupción rechazada                                                                                      |
| Copia en línea con una carga simultánea        | PASS: 10 archivos en la última ejecución; snapshot consistente, historial inmutable y aislamiento frente a credenciales heredadas de la instalación activa |
| Demostración y permisos efectivos              | PASS: 10 cuentas verificadas contra propiedad/asignación real; API sin privilegios de estructura                                                           |
| Exportaciones y concurrencia de lectura        | PASS: PDF/CSV y 100 consultas en grupos de 10; p95 local 36 ms                                                                                             |
| Operación activa                               | Web/API, worker, almacenamiento y respaldo diario saludables                                                                                               |
| Recuperación de la demostración activa         | PASS: contenido exacto de 32 tablas, 10 adjuntos, 8 migraciones y credencial admin conservados                                                             |
| Reinicio completo, incluyendo PostgreSQL       | PASS: se corrigió la selección de base del iniciador portátil; 32 tablas idénticas, 30 perros y login verificados después del arranque                     |

La batería final aislada usó `valkyr_test_1792125568989` (puertos 4001/3100). La restauración con pausa usó `valkyr_test_1792124994280`; el respaldo en línea se repitió sobre la base final tras añadir el rechazo de credenciales que apuntan a otra base. Las comprobaciones de la instalación activa usan sus datos ficticios y navegadores separados. Evidencias en `.local/demo-smoke.json`, `.local/demo-activation.json`, `.local/backup-result.json`, `.local/online-backup-result.json`, `.local/demo-recovery.json`, `.local/demo-restart-result.json` y capturas `.local/demo-*.png`.

Se corrigieron selectores de etiquetas en las pruebas de navegador y se repitieron los casos; la última batería completa pasó. El primer build encontró una restricción de carpetas del aislamiento de Windows; la compilación final con acceso autorizado terminó correctamente. Estos incidentes no se contabilizan como pruebas aprobadas de ese intento.

Se validaron metas, evaluaciones inmutables, cierre concurrente con revisión, fechas, revocación por reasignación, propiedad independiente de custodia, certificaciones/avisos y calendario con extremo exclusivo en hora de Costa Rica. La demostración incorpora expedientes de adultos y cachorros, entrega a propietario, contratos, saldos parciales, devolución, lote vencido y bajo stock.

No se afirma ausencia absoluta de defectos. El alcance pendiente, incluidos Web Push, SMTP real, teléfonos físicos, servidor/HTTPS y S3, está documentado en [PHASE_4_LOCAL.md](PHASE_4_LOCAL.md) y [ROADMAP.md](ROADMAP.md).

## Informe anterior: tres roles y portales (conservado como historial)

Estado de la entrega anterior: **15 de octubre de 2026, Costa Rica**. Se activó entonces la migración 007 y la compilación `.next-release-1792117820463`; quedó sustituida por la demostración descrita arriba.

| Comprobación                           | Resultado                                                                                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript API/web, ESLint, producción | PASS                                                                                                                                        |
| Unitarias                              | 7 PASS                                                                                                                                      |
| API/PostgreSQL                         | 34 escenarios, 39 nodos TAP con 5 contenedores; todos PASS                                                                                  |
| Navegador                              | 10 escenarios verificados: 9 PASS en suite y el caso de galería corregido pasó en repetición dirigida                                       |
| Migración de datos anteriores          | PASS: seis roles convertidos a tres, usuarios/contraseñas/identidades conservados; sin vincular clientes por nombre                         |
| Bootstrap                              | PASS: administrador único, contraseña Argon2id no expuesta, segunda ejecución denegada                                                      |
| Restauración aislada                   | PASS: recuentos de 32 tablas y checksums de 9 archivos, saldos/stock y triggers conservados; respaldo corrupto rechazado                    |
| Activación real                        | PASS: copia previa, migración 007 y comparación de las columnas originales de 33 tablas; único cambio permitido: normalización de User.role |
| Salud de instalación                   | PASS: web 200, admin de prueba ingresa como ADMIN, PostgreSQL/worker/almacenamiento disponibles                                             |

La suite usó `valkyr_test_1792117583975` y puertos 4001/3100. La repetición dirigida verificó el cambio venta → preventa, apertura de los padres, información médica autorizada, vista móvil y ausencia de errores de página. La prueba real no añadió perros ni cuentas; sólo leyó datos y comprobó el login/logout. Se inspeccionaron en el navegador los menús nuevos y el formulario de cuentas con los tres roles.

## Aislamiento verificado

- Cliente A no ve ni descarga datos de cliente B; ser custodio no concede propiedad. Dos cuentas de la misma municipalidad comparten sólo sus perros.
- Entrenador sólo lista y añade información a perros asignados; se deniegan edición, archivo, administración, galería y documentos ajenos/no clínicos.
- Propietario lee historial médico, vacunas, pesos, entrenamiento y archivos de su perro.
- Venta exige disponibilidad, publicación, precio y contacto. El DTO público excluye notas, historial clínico, datos de propietario y documentos privados.
- Preventa sólo admite publicación entre progenitores disponibles para cruza. Retirar un padre o la publicación elimina visibilidad y acceso a su foto de galería.
- Cambiar propietario/asignación revoca acceso en la siguiente petición; deshabilitar entrenador cierra sesión y retira su asignación.
- Se conservaron las pruebas de concurrencia, importes exactos, entregas pagadas, inventario, contratos, MFA, CSRF, recuperación y auditoría.

Evidencia local: `.local/portals-activation.json`, `.local/pre-portals-fingerprints.json`, `.local/portals-smoke.json`, `.local/backup-result.json` y `test-results/portal-preventa-mobile.png`. Respaldo de uso previo: `.local/backups/pre-portals-1792117916704`.

Los informes siguientes corresponden a versiones anteriores. Los roles vigentes son los de [ROLES.md](ROLES.md). Sigue pendiente la validación de un despliegue externo; esta entrega se comprobó en la PC local.

## Verificación histórica de fases 2–3

Fecha: **15 de octubre de 2026, Costa Rica**. Windows, PostgreSQL nativo. Se incorporaron contratos/servicios y crianza/administración, además de controles operativos locales. Los límites y ampliaciones se detallan en [ROADMAP.md](ROADMAP.md), [PHASE_2.md](PHASE_2.md) y [PHASE_3.md](PHASE_3.md). No se declara terminada la validación de un despliegue externo.

## Resultado final de esta ampliación

| Verificación                      | Resultado observado                                                                                                                                      |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript API y web              | PASS                                                                                                                                                     |
| ESLint                            | PASS, sin errores                                                                                                                                        |
| Pruebas unitarias                 | 7 PASS                                                                                                                                                   |
| Integración API/PostgreSQL        | 27 escenarios PASS; 31 nodos TAP contando 4 contenedores                                                                                                 |
| Playwright Chromium               | 7 escenarios PASS, escritorio y viewport móvil                                                                                                           |
| Compilación API y Next producción | PASS; web preparada en directorio separado del build anterior                                                                                            |
| Restauración nativa               | PASS, recuentos de 30 tablas y 5 archivos privados comprobados                                                                                           |
| Integridad tras restaurar         | Triggers de auditoría/versiones/pagos/stock, saldos exactos y existencias contra movimientos preservados                                                 |
| Respaldo corrupto                 | Rechazado por checksum antes de crear destino                                                                                                            |
| Monitor y permisos DB             | API privada distingue worker activo/detenido; rol aislado permite runtime y deniega alterar estructura/historial                                         |
| Instalación de uso                | Backup previo, migraciones 4–6 aplicadas, 14 tablas anteriores comparadas por recuento y huella de sus columnas originales                               |
| Acceso de uso                     | Login real con admin y la contraseña de prueba solicitada; cuenta y contraseña anteriores preservadas                                                    |
| Revisión de producción            | Crianza, apartados, finanzas, inventario, contratos y configuración cargan; worker activo, almacenamiento disponible, cero errores de consola observados |

La prueba completa usó exclusivamente **valkyr_test_1792112254943**, puertos API 4001/web 3100 y build .next-test. No introdujo datos sintéticos en la base de uso. El acceso y la revisión final de producción fueron de lectura, excepto login/logout y su auditoría.

## Cobertura ejercitada

Los 12 escenarios de núcleo comprueban autenticación, CSRF/origen, roles, usuarios sin correo, recuperación administrativa y revocación de sesiones, expediente y unicidad, fechas civiles, vacunas/peso/movimientos, entrenamiento/PDF, archivos privados, citas y deduplicación, auditoría inmutable, MFA, recuperación con token y archivo lógico.

Los 4 escenarios contractuales comprueban importes exactos, revisiones optimistas, versiones, permisos, asignaciones simultáneas, excepción justificada, retiro histórico, archivos privados versionados, alcance del entrenador, servicios, PDF redactado y recordatorios idempotentes.

Los 9 escenarios administrativos comprueban permisos, ciclo genealógico rechazado, incertidumbre y método/profesional de ventana de parto, identidad del cachorro al promover, doble apartado concurrente, capacidad descontando bajas, abonos decimales, reintentos idempotentes, sobreabonos concurrentes, entrega, reintegro/cancelación, cuenta por pagar, adjuntos/CSV/PDF, stock concurrente y vencido, inmutabilidad en PostgreSQL y coordinación entre apartados/asignaciones/estado canino.

Los 2 escenarios operativos comprueban el monitor privado, pulso del trabajador y el SQL de permisos mínimos con un rol efímero aislado. La cuenta de conexión de la instalación de uso **no se sustituyó** por ese rol.

Los 7 recorridos de navegador incluyen: expediente/vacuna/entrenamiento persistentes, móvil/calendario, login/PWA, creación y acceso de socio sin correo, institución/contrato/asignación/servicio, monta/nacimiento/cachorro/apartado/abono y cuenta por pagar/inventario con lote/entrada/consumo. Se comprobó viewport **390×844** sin desbordamiento horizontal en los recorridos móviles. No equivale a validar un teléfono físico.

Los informes PDF de contrato y cuenta se extrajeron y renderizaron para inspección visual: texto legible, logo original y advertencias internas. El informe para cliente excluye importe, cláusulas y notas internas; el de cuenta conserva importes y no se presenta como factura fiscal.

## Restauración y actualización ejecutadas

Origen sintético: **valkyr_test_1792112254943**. Destino aislado: **valkyr_restore_1792112403102**. Respaldo en .local/backup-1792112403102, archivos en .local/restored-1792112403102. Recuentos coincidentes: User 13, Dog 10, Vaccination 3, TrainingSession 3, Document 2, AuditLog 176, Reminder 50, Notification 6, Movement 3, Weight 3, Appointment 1, Institution 3, Contact 1, Contract 3, ContractVersion 5, ContractFile 2, Assignment 4, ServiceLog 2, BreedingProfile 5, BreedingEvent 1, BreedingPlan 2, Litter 2, Reservation 4, Account 6, Payment 9, AccountFile 1, Product 2, StockLot 3, StockMovement 6 y ServiceHeartbeat 1. Los cinco archivos coinciden con sus checksums. Evidencia: .local/backup-result.json.

La instalación de uso se respaldó aparte, con API/web/worker detenidos, en **.local/backups/pre-phase3-1792112671872**. El cierre del iniciador anterior también detuvo PostgreSQL; se reinició la misma instancia antes del respaldo y la migración. La comparación posterior confirmó las mismas filas y valores de las columnas anteriores en 14 tablas, incluyendo cuentas de acceso, hashes de contraseña e historia canina. No se reinicializó la base. Evidencia: .local/phase3-activation.json.

Se activó **.next-release-1792112399635** mediante .local/active-release.json. Web, API, worker y PostgreSQL quedaron funcionando. /api/v1/health respondió ok. Se comprobó inicio de sesión real, navegación de módulos y monitor; no se observaron errores de consola. Captura: .local/production-phase3.png. El iniciador **INICIAR_VALKYR.cmd** utiliza ese build en futuros arranques.

## Entorno

Next.js 16.4.2, React 19.3.1, NestJS 12.1.3, Prisma/adapter-pg 7.10.1, TypeScript 5.9.3, Playwright 1.64.1, Argon2 0.44.0 y Nodemailer 10.1.1. PostgreSQL portátil **18.4**, herramientas de respaldo **18.6**, Node de verificación **24.19.0**. El Node global 22.12.0 no se cambió. El lockfile fija dependencias; la distribución portable PostgreSQL tiene wrapper beta.

Webpack se usa en desarrollo y producción tras el fallo de proceso PostCSS observado con Turbopack en Windows en la entrega anterior. La configuración aislada de Next evita reemplazar el build que sirve la aplicación durante pruebas.

## Evidencia anterior conservada

En la fase de acceso por usuario pasaron bootstrap sin correo, migración que conserva ID/rol/hash/correo y acceso de socios. La migración genera nombres únicos para cuentas anteriores. La revisión npm audit de esa entrega informó cero vulnerabilidades; no sustituye auditoría ni se presenta como una ejecución nueva en esta ampliación.

En la entrega inicial se verificó reinicio PostgreSQL mediante pg_ctl y persistencia de la base restaurada. Se corrigió el desfase horario fijando timezone=UTC en el adaptador y comparando instantes directamente con SQL. El SHA-256 del logo maestro y su copia web fue D161E86CECC65F46C33B9883EE3D0707CCCC33F2850470B817D59D561827692F.

Las herramientas PostgreSQL se obtuvieron del archivo oficial EDB, versión 18.6-5 para Windows x64. SHA-256 calculado localmente del ZIP: E2246BA91D22345BC3D017586C09EDE52D9DF180B1EEB480F050445F1CAD84E2. Identifica esa descarga; no es una firma del proveedor.

## Reproducir

Con PostgreSQL activo y Node 24 compatible:

```sh
npm run db:generate
npm run typecheck
npm run lint
npm test
node node_modules/typescript/bin/tsc -p apps/api/tsconfig.json
npm run test:system
npm run test:backup
node scripts/local-build.mjs
```

test:system guarda credenciales sólo en .local/test-runtime.json, excluido de Git. No compartir esa carpeta ni trazas sin revisión. test:backup usa la base sintética anterior y necesita herramientas PostgreSQL compatibles. La activación del build preparado requiere el procedimiento de DEPLOY_LOCAL; compilar no cambia automáticamente la web activa.

## Pendientes externos y límites

Docker/Compose y GitHub Actions no se ejecutaron; Docker no está instalado y no se creó remoto. No se comprobaron MinIO/S3, SMTP real/Mailpit, LAN desde otro equipo, TLS/dominio, teléfonos iOS/Android físicos ni traslado a servidor. Web Push y sincronización offline no están implementados. El correo sigue condicionado a SMTP; la instalación activa muestra sólo avisos internos.

Cifrado de disco/backups, programación y copia independiente requieren configuración del operador. Sólo secretos MFA usan cifrado de aplicación. No se realizó auditoría legal, pentest, prueba de carga ni validación veterinaria. Las ampliaciones funcionales pendientes están enumeradas en ROADMAP; las pruebas aprobadas cubren el alcance implementado, no certifican toda operación posible.
