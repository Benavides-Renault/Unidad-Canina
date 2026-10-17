# PROMPT MAESTRO PARA CODEX — VALKYR UNIDAD CANINA

> Actualización solicitada por el propietario el 15 de octubre de 2026: acceder mediante nombres de usuario, con correo opcional; preparar una cuenta admin temporal para pruebas en esta PC; crear las cuentas de los socios desde Administración → Usuarios. Esta modificación posterior prevalece sobre la restricción original de credenciales de prueba. El bootstrap de nuevas instalaciones continúa exigiendo una contraseña propia de 12 caracteres o más.

> **Modo de uso:** Copia el texto de este archivo en Codex y adjunta el archivo `valkyr-logo-original.png` o colócalo en el repositorio, preferiblemente en `assets/branding/valkyr-logo-original.png`. Este prompt describe **la versión privada e interna** de la plataforma. No desarrolles todavía un SaaS público ni una tienda comercial.

---

## 1. Rol y objetivo

Actúa como un equipo senior de arquitectura de software, desarrollo full-stack, diseño UX/UI, ingeniería DevOps, pruebas y seguridad de aplicaciones. Tu misión es **diseñar, implementar, probar y documentar una aplicación web funcional y desplegable**, llamada **VALKYR Manager**, para la empresa **VALKYR UNIDAD CANINA**, dedicada al adiestramiento canino, perros de detección, trabajo con municipalidades, operaciones, crianza y gestión de sus perros.

**Requisitos innegociables:**

1. El entregable debe ser **software real que funcione**, conectado a una base de datos persistente; no una maqueta, presentación, prototipo solo visual ni pantallas con botones simulados.
2. Inicialmente la plataforma es **privada**, exclusivamente para el equipo autorizado de VALKYR. No habrá registro público ni múltiples empresas clientes en esta versión.
3. Primero debe poder ejecutarse **en una PC local** y consultarse, con configuración adecuada, desde otros dispositivos autorizados de la misma red. Después debe poder migrarse a **un pequeño servidor propio**, conservando todos los datos, archivos e historiales.
4. Todos los módulos deben ser responsivos en computadora, tableta y celular. Construir una **PWA instalable**. El funcionamiento offline y la sincronización, si se añaden, deben especificarse y probarse explícitamente; no prometer capacidades offline inexistentes.
5. Mantén arquitectura modular, código limpio, tipos seguros, pruebas automatizadas, migraciones y documentación. Diseña los dominios de forma que permitan reutilización en una futura versión comercial, **sin desarrollar el sistema multicliente ahora**.
6. Si el alcance excede una sola iteración, divide el trabajo en fases funcionales. **Completa y prueba una fase antes de pasar a la siguiente** y registra claramente cualquier funcionalidad pendiente. No afirmes que un módulo está terminado mientras mantenga datos ficticios o acciones sin persistencia.

## 2. Identidad visual — respetar el logo original

- Nombre oficial: **VALKYR UNIDAD CANINA**.
- **Usa exactamente el archivo proporcionado**: `valkyr-logo-original.png`. No regeneres, redibujes, estilices, recortes, alteres, deformes, recolorees ni sustituyas el logotipo por una imagen de internet o una interpretación de IA. Preserva los bytes del archivo original como recurso maestro. Si se necesitan miniaturas o íconos, créalos de modo derivado sin reemplazar ni modificar el maestro; respeta proporciones y legibilidad.
- Paleta principal inspirada en los píxeles reales del logo: negro carbón aproximado `#141414`, cobre/dorado aproximado `#C18C5C`, blanco `#FFFFFF`, y acentos discretos azul y rojo presentes en el emblema. Valida la paleta con el archivo de imagen antes de fijar los _design tokens_; no inventes un logo nuevo.
- Estética corporativa sobria, profesional, moderna y elegante; legibilidad y accesibilidad contrastadas. Preferir paneles claros con acentos oscuros y cobrizos; incluir modo oscuro si no compromete la entrega del MVP.
- Interfaz totalmente en **español**, formato regional **Costa Rica (`es-CR`)**, zona horaria predeterminada **`America/Costa_Rica`**, formatos de fecha locales y moneda base **CRC**, con opción de USD donde corresponda.
- Marca visible con moderación en login, barra lateral, reportes y encabezado. No llenar formularios de marcas de agua que reduzcan lectura.

## 3. Stack y arquitectura base

Usa este stack preferente, salvo incompatibilidad que debas justificar por escrito antes de cambiarlo:

- **Frontend:** Next.js + React + TypeScript, Tailwind CSS y componentes accesibles (por ejemplo, shadcn/ui); formularios con validación y manejo de errores reales; PWA.
- **Backend:** NestJS + Node.js + TypeScript; API REST versionada y documentada con OpenAPI/Swagger, autorización comprobada también en servidor.
- **Base de datos:** PostgreSQL con Prisma ORM, migraciones versionadas, integridad referencial, índices y restricciones de unicidad.
- **Colas/notificaciones:** Redis + BullMQ o mecanismo equivalente comprobable para recordatorios y tareas programadas; diseño que permita no perder tareas ante reinicios.
- **Archivos:** almacenamiento privado S3-compatible (por ejemplo, MinIO local con volúmenes persistentes) para fotos, carnés, informes y contratos. Nunca dejar documentos confidenciales disponibles en URLs públicas; entrega mediante controles de permiso y URLs firmadas de corta duración cuando proceda.
- **Correo en desarrollo:** Mailpit; envío real mediante SMTP configurado con variables de entorno en producción. Notificaciones push web mediante Web Push con permisos explícitos, cuando el dispositivo/navegador y HTTPS lo permitan.
- **Infraestructura:** Docker, Docker Compose y volúmenes persistentes; entorno de desarrollo local y configuración de producción para servidor propio. Reverse proxy HTTPS (por ejemplo, Caddy) al desplegar públicamente, con certificados válidos y configuración segura.
- **Calidad:** ESLint/Prettier, validación de tipos, pruebas unitarias/integración, Playwright para flujos E2E esenciales, y GitHub Actions (o equivalente) para CI.

Propuesta de monorepositorio:

```text
valkyr-manager/
  apps/web/                 # Interfaz y PWA
  apps/api/                 # NestJS, autenticación, módulos y API
  apps/worker/              # Tareas programadas y notificaciones (si corresponde)
  packages/shared/          # DTO, tipos, validaciones y utilidades compartidas
  assets/branding/          # Logo original inalterado
  infra/                    # Docker Compose, proxy, respaldos y despliegue
  docs/                     # Arquitectura, manuales, modelo de datos y seguridad
  tests/                    # Pruebas y fixtures sin datos reales
```

Permite ajustar ligeramente la estructura por sencillez, pero explica las decisiones. No introducir servicios externos de pago ni dependencia obligatoria de nube comercial sin autorización explícita.

## 4. Autenticación, usuarios, seguridad y auditoría

**La privacidad es crítica:** datos personales, ubicaciones, contratos, relaciones con municipalidades e información operativa deben tratarse como confidenciales.

- Login privado mediante cuentas creadas o invitadas por un administrador. **No permitir registro público**.
- Primer administrador creado con procedimiento de _bootstrap_ seguro y credencial suministrada durante instalación; nunca contraseña predeterminada escrita en código, ejemplos, logs o repositorios.
- Contraseñas protegidas con Argon2id, política de contraseñas robusta, limitación de intentos, bloqueo temporal razonable, recuperación con tokens de un solo uso y caducidad; considerar MFA TOTP para administradores (implementarlo y documentarlo).
- Sesiones seguras con cookies `HttpOnly`, `Secure` en HTTPS, `SameSite` apropiado, expiración y revocación; protección CSRF donde corresponda; CORS restringido; validación de entrada; consultas parametrizadas; límites de tamaño y verificación de archivos; cabeceras de seguridad.
- Roles vigentes por ajuste del propietario: **administrador**, **entrenador** y **cliente** (persona o municipalidad). ADMIN administra todo; TRAINER añade salud y entrenamiento sólo a perros asignados; CLIENT lee el historial completo de perros propios y la galería autorizada. Propiedad y custodia son vínculos separados. Ver ROLES.md.
- Roles no reemplazan comprobaciones de propiedad/alcance: toda lectura, modificación, descarga de archivo y exportación deberá verificar autorización en el backend. Mantener el acceso de terceros, incluidos clientes/municipalidades, **desactivado inicialmente**.
- Cifrado **en tránsito** con TLS en producción; proteger secretos y cifrar datos sensibles en reposo con una estrategia explícita (cifrado del volumen/backups y, donde aplique, cifrado a nivel de aplicación). **No afirmar que todo está cifrado si no está implementado o documentado**.
- Bitácora de auditoría append-only para creación, edición, eliminación lógica, cambios de estado, descargas sensibles, acceso a contratos y acciones de administración: usuario, fecha/hora, entidad, identificador, operación, resumen de cambios y origen cuando sea apropiado. No guardar contraseñas, tokens ni secretos en logs.
- Respaldo, recuperación, retención de datos, política de eliminación, consentimiento/avisos cuando corresponda, y revisión de normas aplicables de protección de datos en Costa Rica; **no declarar certificaciones o cumplimiento legal garantizado sin auditoría**.
- Elaborar `docs/SECURITY.md` y un modelo de amenazas básico; usar OWASP ASVS como guía para controles aplicables y documentar limitaciones.

## 5. Módulo central: expediente digital canino

Cada perro tendrá un identificador UUID interno, código legible VALKYR, ficha detallada y documentos asociados.

**Datos de identificación:** nombre de llamado, nombre registrado, fotografía principal y galería, fecha de nacimiento (real o estimada), edad calculada, sexo, raza, variedad, color/capa, señas particulares, peso e historial de mediciones, microchip (único cuando esté presente), otros identificadores, registro canófilo, número de pedigrí, asociación/club, propietario, criador/origen, fecha de ingreso, observaciones y anexos.

**Datos operativos:** ubicación actual (instalación, canil, municipio u otra sede), historial de movimientos, responsable/custodio, especialidades (obediencia, detección, patrullaje u otras configurables), capacidades/certificaciones, fecha de certificación y caducidad. Historial completo de asignaciones.

**Estados independientes, no un solo estado excluyente:** situación administrativa (propio, en préstamo, vendido, retirado, fallecido, etc.), fase de trabajo (en formación, operativo, descanso, baja temporal), estado reproductivo y disponibilidad para contrato/reserva. El mismo perro puede estar operativo y participar de un plan de cría; evita contradicciones y define reglas de negocio.

Permitir alta/edición autorizada, filtros por raza/estado/edad/ubicación/responsable/contrato, búsquedas, exportación CSV/PDF, archivado lógico, carga de archivos y visualización de línea de tiempo integral. Ningún borrado físico de información crítica sin procedimiento privilegiado, validación y auditoría.

## 6. Salud, medicina preventiva y carné digital

- Expediente veterinario longitudinal: consultas, diagnósticos registrados por personal autorizado, tratamientos, medicamentos, alergias, lesiones, cirugías, análisis y archivos clínicos.
- Control de **vacunas** con fecha aplicada, nombre de producto, fabricante, lote, profesional, dosis/observaciones, documento de respaldo y fecha de próxima dosis. Permitir varias vacunas y esquemas por perro.
- **Carné digital de vacunación** imprimible y descargable en PDF, con identidad VALKYR y datos trazables; diferenciar claramente entre registro interno y certificación oficial de un veterinario.
- Desparasitaciones internas/externas, pesajes, controles, exámenes, medicamentos y recordatorios configurables.
- Citas con fecha, hora, lugar, profesional, motivo, estado y recordatorios por correo/push.
- Vencimientos y avisos configurables (por ejemplo, 30, 7 y 1 día antes), sin duplicaciones y con registro de envío y errores.
- No administrar tratamientos ni sugerir dosis automáticamente; cálculos clínicos o esquemas preventivos requieren revisión veterinaria.

## 7. Adiestramiento y evolución del perro

- Plan de entrenamiento individual por objetivo, especialidad, etapa, responsable y periodos.
- **Bitácora por sesión:** fecha/hora, entrenador, perro, lugar, disciplina, objetivo, duración, ejercicios, material usado, nivel de dificultad, resultados, incidencias, observaciones, fotografías o archivos.
- Para perros de detección: categoría general de objetivo/olor entrenado configurable, tipo de ejercicio, escenario general, señalización, aciertos, alertas falsas, fallas, observaciones y evaluación. Los datos operativos sensibles se protegen por rol.
- Evaluaciones con criterios y rúbricas configurables, puntuaciones comparables, indicadores de progreso, gráficas y línea de tiempo; evitar calcular métricas engañosas con pocas muestras y mostrar el tamaño de la muestra.
- Adjuntar informes o videos con límites de tamaño; generar un reporte PDF por perro/periodo y una vista de entrenamiento pendiente.
- Registrar certificaciones, renovaciones y fechas de caducidad con sus documentos.

## 8. Operaciones, asignaciones y contratos

- Catálogo de clientes/instituciones: municipalidades, empresas y contactos autorizados, con datos administrativos y responsables.
- **Contratos** con número, cliente, objeto, monto, moneda, periodicidad, fecha inicio/fin, renovaciones, estado, responsables, cláusulas resumidas, observaciones y archivos digitales/versiones del contrato.
- Relación **muchos-a-muchos entre perros y contratos** mediante asignaciones con fechas y roles; conservar historial y detectar solapamientos incompatibles con alertas, sin bloquear excepciones autorizadas.
- Clasificar perros en servicio activo, entrenamiento, disponibles, reserva, crianza, retirados, etc., con vistas y filtros.
- Bitácora de servicios por contrato, turnos generales, incidencias, mantenimiento/certificaciones relevantes, documentación y reporte para cliente redactado según permisos.
- Alertas por próximos vencimientos de contrato, documentos o certificaciones; panel de contratos activos, por vencer y finalizados.
- Restringir exportaciones e información contractual según rol.

## 9. Reproducción, cruces, gestaciones, camadas y apartados

- Perfiles reproductivos de machos y hembras; celos, controles sanitarios, historial reproductivo, condición médica registrada y documentos.
- **Planificación de cruces:** candidatos, pedigrí/ascendencia, fechas previstas y efectivas, confirmación de monta, controles veterinarios y observaciones.
- Árbol genealógico y alertas orientativas de consanguinidad **solo cuando exista información suficiente**; identificar incertidumbre y requerir revisión profesional.
- Seguimiento de gestación con hitos y **ventana de fecha probable de parto** configurable. Evitar prometer precisión por raza: por ejemplo, la estimación basada en ovulación puede rondar 63 días, mientras que la fecha de monta ofrece un margen más amplio. Mostrar el método, los datos usados, margen de incertidumbre y que no sustituye valoración veterinaria.
- Registro de parto, **camada**, identificador, padres, fecha, número de nacidos vivos/no vivos cuando se registre, seguimiento y fotos.
- Identificación individual de cachorros (sexo, color, peso, microchip cuando exista), vacunación, desparasitación, destino y vinculación automática a la camada. Posibilidad de promover cachorro a expediente canino sin duplicar identidad.
- **Apartados/reservas** ligados a cachorro específico o a una camada, fecha, persona interesada, estado, monto de anticipo, saldo, vencimiento, comprobante y condiciones. Evitar vender/reservar dos veces el mismo cachorro sin alerta/regla de autorización.
- Registro histórico de cruces, nacimientos, entregas y bajas.

## 10. Finanzas, cuentas por pagar/cobrar e inventarios

- **Cuentas por pagar:** proveedores, concepto, importe, moneda, vencimiento, estado, pagos parciales, adjuntos y categorías (alimentación, veterinaria, personal, equipo, etc.).
- **Cuentas por cobrar:** facturas/registros de cobro internos por contrato, reserva o servicio; importes, vencimientos, abonos, saldos y morosidad.
- Gastos e ingresos asociables a perros, camadas, contratos y centros de costo; resumen mensual por contrato/perro y filtros por fechas.
- Soporte para CRC y USD, tipo de cambio configurable y registro explícito del tipo de cambio usado. Evitar mezclar monedas sin conversión documentada.
- Inventario de alimento, medicamentos, insumos, equipo: producto, lote, unidad, stock, movimientos, costo, mínimos y caducidad cuando corresponda; consumo asignable a perro o área.
- Tableros financieros y exportación CSV/PDF, visibles solo a roles autorizados.
- **No simular integración con Hacienda ni emitir facturas electrónicas oficiales** sin integración específica y requisitos fiscales validados. El módulo financiero inicial es de control interno.

## 11. Calendario, tareas, alertas y panel de control

Diseñar un **dashboard** útil tras iniciar sesión con:

- Total de perros y desglose por situación operativa.
- Perros asignados a contratos activos, en formación, disponibles y en crianza.
- Vacunas, citas, certificaciones y contratos próximos a vencer.
- Próximas tareas de entrenamiento, cruces, camadas y reservas.
- Ingresos/gastos y pendientes según permisos.
- Atajos a crear perro, añadir entrenamiento, programar cita, cargar contrato y registrar pago.

**Calendario unificado** con vistas día/semana/mes, filtros por tipo, asignación de responsables y estados. Notificaciones internas, correo SMTP configurable y Web Push cuando sea viable, con preferencias del usuario, programación persistente, reintentos, idempotencia, deduplicación e historial de entregas. Las alertas no deben depender de que la interfaz permanezca abierta.

## 12. Experiencia de usuario

- Menú lateral claro: Inicio, Perros, Salud, Entrenamiento, Operaciones, Contratos, Crianza, Camadas/Apartados, Finanzas, Inventario, Calendario, Reportes, Usuarios/Configuración.
- Ficha de perro como **centro de navegación**, con pestañas para resumen, salud, vacunas, entrenamiento, documentos, ubicaciones, contratos, reproducción y auditoría autorizada.
- Búsqueda global, filtros persistentes, tablas paginadas, formularios con autosalvado o protección frente a pérdida de cambios, mensajes de confirmación/errores, estados vacíos útiles y cargas perceptibles.
- Diseño responsive y accesible (teclado, etiquetas, navegación, contraste), adecuado para trabajo en campo mediante teléfono.
- Pantallas de error 403/404/500 útiles, mensajes claros en español y nunca exponer trazas privadas al navegador.
- No poner datos de ejemplo como si fueran registros reales. Los datos de demostración deben estar marcados y mantenerse únicamente en entorno de desarrollo/test.

## 13. Datos, integridad y migración

- Crear esquema relacional normalizado, ERD, migraciones versionadas y restricciones, índices y claves foráneas razonables.
- Campos de creación/actualización, auditoría e identificadores estables; tratamiento correcto de zona horaria (persistir instantes de tiempo en UTC cuando aplique, mostrar `America/Costa_Rica`; fechas clínicas sin hora como fechas civiles).
- Documentos con metadatos, propietario/entidad asociada, checksum, tamaño, tipo, versionado cuando sea apropiado y reglas de descarga.
- Operaciones transaccionales para pagos, reservas, asignaciones y estados para evitar inconsistencias por solicitudes concurrentes.
- Importación CSV opcional y exportación CSV/PDF en operaciones críticas, verificando permisos.
- Implementar **respaldo y restauración** de PostgreSQL y archivos, con scripts documentados, cifrado cuando corresponda, prueba de restauración y verificación de integridad. Nunca borrar volúmenes en actualizaciones por defecto.
- Preparar un plan de traslado desde PC a servidor: exportar/restaurar datos, copiar objetos y secretos de forma segura, ejecutar migraciones y verificar archivos/recuentos; no exigir reingreso manual de perros.

## 14. Instalación local, acceso de socios y traslado posterior

El propietario comenzará en una computadora personal y después migrará a un servidor pequeño. **No supongas el sistema operativo ni los recursos del servidor**.

1. Incluye `.env.example` sin credenciales reales, `compose.yaml` para desarrollo y configuración de despliegue de producción separada, volúmenes persistentes y comandos claros para iniciar, detener, actualizar y respaldar.
2. Proporciona instrucciones específicas de Docker Desktop + WSL2 para Windows y equivalentes para Linux, señalando dónde se diferencian. Valida los comandos en la medida que permita el entorno.
3. En la PC, dar una URL de acceso local de desarrollo y explicar cómo permitir acceso a los socios desde la **LAN privada**, restringiendo firewall y usuarios; no exponer servicios de base de datos ni almacenamiento a la red.
4. Si el equipo requiere acceso remoto antes de tener un servidor público, documentar alternativa privada como VPN (WireGuard/Tailscale) en lugar de abrir puertos sin protección.
5. Para servidor, configurar proxy inverso, HTTPS válido, dominio cuando el dueño lo tenga, actualizaciones, almacenamiento, firewall, monitoreo, respaldo programado y restauración.
6. Dejar claro que **push web en dispositivos remotos normalmente requiere contexto seguro HTTPS** y permisos del navegador; para pruebas locales utilizar `localhost` cuando aplique. El correo real requiere SMTP configurado.
7. No ejecutar acciones destructivas, abrir repositorios públicos, comprar servicios, exponer puertos a internet ni publicar imágenes/documentos sin permiso del propietario.
8. Generar guía para un **repositorio GitHub privado**, `.gitignore` riguroso, CI y secuencia de commits significativos. Solo hacer `git push` si existe acceso/autorización; de lo contrario dejar el código listo y dar comandos.

## 15. Fases de desarrollo exigidas

Construye en este orden para que exista valor real temprano:

- **Fase 0 — Fundamentos:** levantar monorepo y Docker, PostgreSQL, backend/frontend, logo real, layout responsive, esquema inicial, autenticación y permisos, bootstrap de administrador, auditoría básica, documentación.
- **Fase 1 — Operación canina esencial (MVP inicial):** CRUD real de perros, ubicación/estados, fotos y archivos protegidos, carnet de vacunación, citas, calendario, recordatorios, bitácora de entrenamiento, dashboard y exportaciones esenciales. **Debe poderse usar con datos verdaderos** antes de avanzar.
- **Fase 2 — Contratos y servicios:** instituciones/contactos, contratos digitales, asignación de perros, vencimientos, bitácora operativa y reportes.
- **Fase 3 — Crianza y administración:** cruces, ventanas de gestación, camadas, cachorros, reservas/anticipos, cuentas por pagar y cobrar, movimientos e inventario.
- **Fase 4 — Endurecimiento y entrega:** auditoría y permisos completos, PWA, UX móvil, alertas push cuando se soporten, pruebas, monitoreo, respaldos/restauración, revisión de seguridad, optimizaciones y documentación de migración al servidor.

Al terminar **cada fase**, ejecutar verificaciones automáticas posibles, documentar lo que funciona y lo pendiente, y mantener la aplicación arrancable. Si el tiempo no alcanza, prioriza entregar Fases 0 y 1 completas **sin fingir** que las Fases 2–4 están completas. Deja tickets/TODO concretos para seguir en nuevas sesiones.

## 16. Pruebas mínimas y criterios de aceptación

Demuestra mediante pruebas y/o instrucciones verificables estos escenarios:

1. Administrador inicia sesión; usuario no autenticado no puede consultar datos; entrenador no puede ver finanzas ni descargar un contrato sin autorización.
2. Crear perro con microchip, foto, ubicación y documentos; cerrar y reabrir sesión y verificar que persiste. Duplicar un microchip provoca error controlado.
3. Añadir vacuna con fecha/producto/próximo vencimiento; verla en ficha y carné PDF; programar recordatorio y verificar ejecución en entorno de prueba.
4. Registrar varias sesiones y visualizar evolución cronológica/gráfica.
5. Crear institución, subir contrato privado, asignarle un perro, consultar vencimiento y retirar asignación conservando historial.
6. Registrar cruces y camada, crear cachorro y apartado, registrar abono y evitar reservas conflictivas.
7. Registrar cuenta por pagar, abono y movimiento de inventario, y comprobar sumas/cambios de saldo.
8. Verificar que archivos y API deniegan acceso sin autorización; comprobar carga de archivo inválido.
9. Reiniciar contenedores y comprobar persistencia; realizar y **probar restauración** de respaldo en entorno aislado.
10. Acceder desde móvil a las pantallas principales y documentar requisitos de LAN/HTTPS.

Todos los cambios significativos deben pasar, al menos: comprobación TypeScript, lint, tests unitarios y pruebas E2E de flujos prioritarios. Registrar resultados reales; no inventar resultados de pruebas que no ejecutaste.

## 17. Entregables finales

Entregar dentro del repositorio:

- Código fuente completo frontend/backend/worker, migraciones, esquemas, contenedores y configuración.
- `README.md` de inicio rápido y comandos de desarrollo/producción.
- `.env.example`, sin secretos, y lista explicativa de cada variable necesaria.
- `docs/ARCHITECTURE.md`, diagrama de entidades, `docs/SECURITY.md`, `docs/ROLES.md`, `docs/BACKUP_RESTORE.md`, `docs/DEPLOY_LOCAL.md`, `docs/DEPLOY_SERVER.md`, `docs/USER_GUIDE.md` y `docs/ROADMAP.md`.
- API OpenAPI, semillas **solo con catálogos y datos sintéticos opcionales** (no cargar datos reales automáticamente).
- Pruebas, reporte de ejecución, lista de limitaciones y checklist de puesta en producción.
- Guía concreta para subir a un repositorio **GitHub privado** sin publicar datos ni secretos.

## 18. Cómo debes responder e iniciar el trabajo

1. Examina primero el repositorio/directorio y confirma que el **archivo original del logo está presente**. Si falta, **pídemelo** antes de finalizar la identidad visual; no crees uno parecido.
2. Resume en pocas líneas la arquitectura, identifica las decisiones de alto riesgo y presenta el plan por fases; después **empieza a programar**, no te limites a responder con un plan.
3. Usa versiones estables y mantenidas, evitando fijar versiones obsoletas; documenta las versiones efectivamente instaladas.
4. No solicites detalles opcionales que puedas convertir en configuraciones; si falta una decisión indispensable (por ejemplo, credenciales iniciales o entorno concreto de despliegue), pregunta de manera precisa y ofrece una configuración segura de desarrollo mientras tanto.
5. Muestra al cerrar cada fase: qué implementaste, cómo levantarlo, qué pruebas ejecutaste con resultado verificable, capturas solo si están disponibles, y qué queda pendiente.
6. Deja el código apto para seguir evolucionando y después reutilizar módulos en una futura versión SaaS, **sin implementar multi-tenancy, suscripciones ni registro público ahora**.

**Comienza con la Fase 0 y continúa con la Fase 1 hasta dejarlas operativas. A partir de allí, progresa por las fases siguientes según el entorno y tiempo disponibles. Prioridad absoluta: calidad, persistencia y privacidad reales por encima de aparentar que todo está finalizado.**
