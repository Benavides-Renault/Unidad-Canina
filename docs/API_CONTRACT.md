# Contrato de implementación Fases 0–3 y monitoreo local

## Extensión de seguimiento y operación local

- `GET /follow-up/dogs/:id`: planes, objetivos, todas las evaluaciones y certificaciones activas. ADMIN: todos; TRAINER: asignados; CLIENT: propios.
- `POST /follow-up/dogs/:id/plans`: ADMIN/TRAINER, `{title,discipline,startDate,dueDate,goals:[{title,criterion,targetScore}]}`. 1–12 objetivos, meta entera 1–100.
- `POST /follow-up/goals/:id/evaluations`: ADMIN/TRAINER con el mismo alcance; `{eventDate,score,notes}`. Fecha entre inicio del plan y hoy; plan activo; resultado entero 0–100. Inmutable.
- `PATCH /follow-up/plans/:id`: ADMIN; `{revision,status,dueDate?}`. ACTIVE/COMPLETED; metas alcanzadas para completar. Conflicto 409 cuando cambió la revisión. `DELETE` archiva el plan y conserva sus evaluaciones.
- `POST /follow-up/dogs/:id/certificates`: ADMIN/TRAINER; `{title,issuer,reference?,issueDate,expiresDate?,notes?}`. Emisión no futura; vencimiento posterior a emisión. `DELETE /follow-up/certificates/:id`: ADMIN, archivo lógico y cancelación de avisos pendientes.
- `GET /calendar/events?from=YYYY-MM-DD&to=YYYY-MM-DD&type=ALL`: ADMIN. Máximo 62 días, final exclusivo en Costa Rica; tipos APPOINTMENT/VACCINATION/TRAINING_PLAN/CERTIFICATION/BREEDING/CONTRACT/RESERVATION/ACCOUNT. Devuelve `{items,total}` con eventos normalizados; `sourceId` conserva el id de la cita para acciones.
- `GET /system/status` añade `backupEnabled`, `backupHealthy`, `backupLastSuccess`. `GET /health` añade `demoMode` sin exponer configuración privada.

API `/api/v1`, interfaz mismo origen con proxy Next. JSON camelCase, ids UUID, fechas civiles YYYY-MM-DD, instantes ISO UTC. Errores `{message: string | string[]}`. Listados paginados `{items, total, page, pageSize}` salvo catálogos explícitos. Todas las rutas privadas salvo health/login y recuperación. Cookie HttpOnly `valkyr_session`; CSRF double-submit: cookie legible `valkyr_csrf` y cabecera `x-csrf-token` para POST/PATCH/DELETE autenticados. Sesiones sólo servidor. Sin registro público.

Roles: ADMIN, TRAINER, CLIENT. Los módulos administrativos se restringen a ADMIN. Entrenadores usan /trainer con alcance por assignedTrainerId; clientes usan /portal con alcance por ownerPartyId = User.partyId. Consultar ROLES.md. Importes y cantidades decimales se reciben y devuelven como cadenas.

- GET /health → {status}; POST /auth/login {username,password,totp?} → {user:{id,name,username,email,role},mfaRequired?}; GET /auth/me → user directo; POST /auth/logout. `email` puede ser null. `username` se normaliza a minúsculas, tiene 3–40 caracteres y admite letras ASCII, números, puntos, guiones y guion bajo, comenzando con letra o número.
- POST /auth/forgot-password {username}; POST /auth/reset-password {token,password}. El envío requiere correo asociado y SMTP; la respuesta no revela si existe la cuenta.
- POST /auth/mfa/setup → {secret,uri}; POST /auth/mfa/enable {code}; POST /auth/mfa/disable {code,password}. UI puede mostrar secret y uri sin QR.
- GET /users → {items,total,page,pageSize}; POST /users {name,username,email?,password,role}; PATCH /users/:id {name?,username?,email?,password?,role?,active?}. ADMIN. `email:null` elimina el correo opcional. Cambiar contraseña revoca las sesiones y los tokens pendientes de recuperación; no devuelve ni registra la contraseña. Las nuevas contraseñas requieren 12–128 caracteres.
- GET /dashboard → {totalDogs,operationalDogs,trainingDogs,availableDogs,upcomingVaccinations:[],upcomingAppointments:[],recentTraining:[],trainingCount}.
- GET /dogs?search=&workStatus=&location=&page=1&pageSize=20 → listado; POST /dogs; GET /dogs/:id → dog con `vaccinations`, `trainingSessions`, `appointments`, `documents`, `movements`, `weights`; PATCH /dogs/:id; DELETE /dogs/:id archiva. Campos: code (autogenerado si falta), name, registeredName?, birthDate?, birthDateEstimated (bool), sex (MALE/FEMALE), breed, coat?, markings?, microchip?, pedigreeNumber?, registry?, owner?, breeder?, intakeDate?, location?, custodian?, specialties? (string[]), administrativeStatus (OWNED/LOANED/SOLD/RETIRED/DECEASED), workStatus (TRAINING/OPERATIONAL/REST/TEMPORARILY_UNFIT), reproductiveStatus (NONE/AVAILABLE/PLANNED/PREGNANT/NURSING/RETIRED), availability (AVAILABLE/ASSIGNED/RESERVED/UNAVAILABLE), notes?. `photoId` referencia documento protegido.
- GET /dogs/export.csv (antes de :id); GET /dogs/:id/card.pdf carné interno; GET /dogs/:id/report.pdf informe entrenamiento/identidad.
- POST /dogs/:id/vaccinations {product,appliedDate,nextDueDate?,manufacturer?,batch?,professional?,notes?}; PATCH /vaccinations/:id mismos campos.
- POST /dogs/:id/weights {date,kg}; POST /dogs/:id/movements {date,location,custodian?,notes?}.
- GET /training?dogId=&page=&pageSize= → listado; POST /dogs/:id/training {occurredAt,discipline,objective,durationMinutes,location?,exercises?,material?,difficulty?,successes?,falseAlerts?,misses?,score?,notes?}.
- GET /appointments?from=&to= → listado; POST /appointments {dogId,title,startsAt,location?,professional?,notes?,remindBeforeHours?}; PATCH /appointments/:id {status? (SCHEDULED/COMPLETED/CANCELLED),...}.
- POST /dogs/:id/documents multipart `file`, `category` (PHOTO/DOCUMENT/CLINICAL); GET /documents/:id/download; DELETE /documents/:id archivado. PDF/JPEG/PNG hasta 10 MB; magic bytes. Document metadata {id,name,mimeType,size,category,createdAt}; al subir PHOTO actualiza photoId.
- GET /notifications → listado de recordatorios de usuario {id,title,body,readAt,createdAt}; PATCH /notifications/:id/read.
- GET /audit?dogId=&page= → listado sólo ADMIN.

No datos demo en base de uso. Bootstrap CLI con entrada oculta/variables, no credenciales prefijadas. Recordatorios persistentes en PostgreSQL con trabajador y claims transaccionales; notificaciones internas siempre, SMTP sólo configurado. Almacenamiento privado local para ejecución nativa; S3 MinIO configurable para Compose. No servicio público.

## Contratos y servicios

- `GET/POST /institutions`, `PATCH /institutions/:id`: name, kind, taxId?, address?, notes?. `POST /institutions/:id/contacts`: name, position?, email?, phone?. Lectura BUSINESS; escritura ADMIN.
- `GET/POST /contracts`, `GET/PATCH /contracts/:id`: number, institutionId, title, amount (cadena decimal), currency (CRC/USD), periodicity, startDate, endDate, status (DRAFT/ACTIVE/COMPLETED/CANCELLED), responsible, clauses?, notes?. PATCH exige `expectedRevision`. Lectura BUSINESS; escritura administrativa. Cada cambio conserva versión. Filtros del listado: search, status, dueBefore, dogId.
- `POST /contracts/:id/assignments`: dogId, handlerId, role, startDate, endDate, overlapReason?. El motivo autoriza una excepción administrativa auditada; sin él un solapamiento devuelve 409. `POST /contracts/:id/assignments/:assignmentId/release` conserva historia.
- `POST /contracts/:id/files` multipart file; `GET /contracts/:id/files/:fileId/download`. Descarga BUSINESS, subida administrativa. Versiones privadas PDF/PNG/JPEG hasta 10 MiB.
- `GET /contracts/:id/client-report.pdf?from=&to=`: periodo de instantes ISO opcional; excluye importes, cláusulas y notas internas, máximo 1000 servicios.
- `GET /operations/handlers`, `GET /operations/assignments`, `GET/POST /operations/services`. Servicio: contractId, occurredAt, endsAt, location, publicSummary, internalNotes?. ADMIN; gestión administrativa de asignaciones y servicios. No expone datos financieros del contrato.

## Crianza

Permisos CLINICAL (ADMIN), excepto promoción sólo administrativa.

- `GET /breeding/options` catálogo mínimo de progenitores; `GET /breeding/dogs` paginado; `GET/PATCH /breeding/dogs/:id`: sireId?, damId?, pedigreeQuality (UNKNOWN/REPORTED/DOCUMENTED), pedigreeSource?, healthNotes?, professional?, expectedRevision. La fuente es necesaria para calidad DOCUMENTED. Rechaza ciclos.
- `POST /breeding/dogs/:id/events`: kind (HEAT/CHECK/HISTORY), eventDate, professional?, notes. Detalle incluye los últimos 100 eventos y genealogía hasta tres generaciones.
- `GET/POST /breeding/plans`, `PATCH /breeding/plans/:id`: damId, sireId, plannedDate, matingDate?, windowStart?, windowEnd?, estimationMethod?, professional?, notes?, status. PATCH exige expectedRevision. Status PLANNED/MATED/CONFIRMED/CANCELLED; COMPLETED lo establece el nacimiento. Una ventana requiere ambos extremos, método, profesional y monta.
- `GET /breeding/plans/:id/ancestry`: comparación de antepasados conocidos y advertencias de información incompleta; no coeficiente genético.
- `GET/POST /breeding/litters`, `GET /breeding/litters/:id`: code, damId, sireId, planId?, birthDate, liveBorn, stillBorn?, notes?. Si existe plan debe coincidir con progenitores y monta/confirmación.
- `POST /breeding/litters/:id/puppies`: name, sex, breed, coat?, microchip?, weightKg?. `POST /breeding/puppies/:id/promote` conserva el mismo Dog.id. El directorio `/dogs` excluye cachorros sin promover salvo `includePuppies=true`.

## Apartados, finanzas e inventario

Permisos BUSINESS (ADMIN); cierre de apartado sólo administrativo. Fechas son civiles. Importes admiten dos decimales; cantidades de stock tres. `requestId` UUID es obligatorio para pagos y movimientos; repetir contenido devuelve la operación existente, usar la misma clave con otro contenido devuelve 409.

- `GET /reservations/options`, `GET/POST /reservations`: litterId, dogId?, customer, contact?, reservedDate, expiresDate, conditions?, amount, currency. Cupo y cachorro se validan dentro de transacción; crea cuenta por cobrar.
- `POST /reservations/:id/allocate` vincula dogId de la misma camada. `POST /reservations/:id/close` cierra como DELIVERED/CANCELLED/EXPIRED con motivo. Entrega requiere saldo cero; cancelación/vencimiento requiere reintegrar los abonos. No hay cancelación automática al vencer.
- `GET /finance/references`: identificaciones mínimas para enlaces, sin información clínica. `GET/POST /finance/accounts`, `GET /finance/accounts/:id`: direction (PAYABLE/RECEIVABLE), party, concept, category, costCenter?, amount, currency, issueDate, dueDate, exchangeRate?, exchangeDate?, dogId?, litterId?, contractId?, notes?. Cambio y fecha se aportan juntos. Saldo/abonado/estado se calculan del historial, sin conversión entre monedas.
- `POST /finance/accounts/:id/payments`: kind (PAYMENT/REFUND), amount, paidDate, method, reference?, notes?, requestId. No permite sobreabonar ni reintegrar más de lo recibido. `POST /finance/accounts/:id/cancel` requiere pagos netos cero; las cuentas de apartado se cierran mediante su apartado.
- `GET /finance/summary`, `GET /finance/export.csv`: filtros search, direction, currency, dogId, litterId, contractId, from/to por **emisión**. Resumen separado por moneda y dirección. CSV máximo 5000 cuentas. `GET /finance/accounts/:id/report.pdf` es un registro interno, no fiscal.
- `POST /finance/accounts/:id/files` multipart file y `GET /finance/accounts/:id/files/:fileId/download`: comprobantes privados PDF/PNG/JPEG hasta 10 MiB.
- `GET/POST /inventory/products`, `GET /inventory/products/:id`: sku, name, category, unit, minimum. `POST /inventory/products/:id/lots`: batch, expiresDate?, unitCost, currency; stock inicial cero.
- `GET /inventory/movements`; `POST /inventory/lots/:id/movements`: kind (IN/OUT/DISPOSAL), quantity, movementDate, reason, area?, dogId?, requestId. Bloquea lote en transacción; no permite existencias negativas ni consumir lote vencido. DISPOSAL registra baja.
- `GET /system/status`: sólo ADMIN; pulso del trabajador (saludable hasta dos minutos), cola pendiente/fallida/atrasada, almacenamiento y configuración SMTP sin secretos.

Listados paginados nuevos: instituciones, contratos, asignaciones, servicios, perros reproductores, planes, camadas, apartados, cuentas, productos y movimientos. `pageSize` máximo 100. Catálogos explícitos `options`, `references` y `handlers` no comparten ese formato. Consultar OpenAPI generado por los esquemas Zod para nombres exactos de cuerpos de cierre/retiro y validaciones.

## Portales y publicaciones

- GET/POST /parties, PATCH /parties/:id: ADMIN; entidades propietarias y custodias (name, kind, phone?, email?). UNIT identifica VALKYR; las demás son PERSON, MUNICIPALITY u ORGANIZATION.
- POST /dogs requiere ownerPartyId y custodianPartyId; admite assignedTrainerId nullable. PATCH admite cambiar estos vínculos. POST /dogs/:id/movements requiere custodianPartyId, location y date.
- POST /users admite partyId?, partyName?, partyKind?; sin entidad crea una para cliente/entrenador. PATCH admite partyId y revoca sesiones cuando se cambia.
- GET /portal/dogs y GET /portal/dogs/:id: CLIENT (o vista propia ADMIN), sólo perros propios. Detalle con historial médico completo, vacunas, entrenamiento, pesos, citas, movimientos y documentos activos.
- GET /portal/documents/:id/download: documento de perro propio, incluyendo clínicos.
- GET /trainer/dogs y GET /trainer/dogs/:id: TRAINER sólo asignados; ADMIN todos. Incluye salud, entrenamiento, fotos y comprobantes clínicos.
- POST /trainer/dogs/:id/training, /medical, /vaccinations, /weights, /documents: añadir a perro asignado. Medical: eventDate, kind (OBSERVATION, CONSULTATION, TREATMENT, DEWORMING), title, notes, professional?. Documents multipart sólo file (PDF/PNG/JPEG, 10 MiB), siempre CLINICAL.
- GET /trainer/documents/:id/download: clínico o foto de asignado. PATCH/DELETE /trainer/medical/:id: sólo ADMIN; corrección o archivado.
- PATCH /catalog/dogs/:id: ADMIN; commercialCategory (NOT_LISTED/FOR_SALE/FOR_BREEDING), salePublished, saleCurrency y opcionales salePrice, saleContact, publicDescription, achievements, trainingSummary, functionalities, healthSummary, pedigreeSummary.
- GET /portal/gallery/dogs, /dogs/:id, /crosses: publicaciones vigentes y selectores explícitos de campos públicos. GET /portal/gallery/photos/:id valida que sea foto principal de perro en venta o progenitor de cruce publicado elegible.
- Plan de cruce admite published, publicTitle, publicDescription, puppyPrice, currency, contact. Sólo ADMIN entre padres disponibles en FOR_BREEDING.
- Apartado admite customerPartyId; cerrar con DELIVERED exige propietario cliente válido y cuenta pagada. La entrega asigna propiedad/custodia y retira publicación/entrenador.

# Ampliaciones 009–010

- `GET/PATCH /preferences`: preferencias propias de calendario, correo y push.
- `GET /records/dogs/:id`: clínica estructurada, destinos de adjuntos y comprobantes según propiedad/asignación. `GET /records/medical/:id/versions`: historial de correcciones.
- `POST /records/:type/:id/files`: ADMIN/TRAINER según alcance; PDF/PNG/JPEG y MP4 únicamente en TRAINING/EVALUATION, 25 MB. `GET /records/files/:id/download` y `DELETE /records/files/:id` (archivo lógico exclusivo de ADMIN).
- `PATCH /trainer/medical/:id`: exige `revision` y `correctionReason`; conflicto 409 para versión anterior. Conserva una revisión inmutable por cambio. Un registro archivado deja de entregar sus comprobantes por las rutas de cliente/entrenador.
- `GET/POST/PATCH/DELETE /templates[/:id]`: lectura de plantillas permitidas; escritura sólo ADMIN, edición con `revision`. Certificado con `templateId` conserva una instantánea. `GET /follow-up/certificates/:id/report.pdf` respeta propiedad/asignación.
- `PATCH /institutions/:id/contacts/:contactId`: edición administrativa. `POST /contracts/:id/renew`: contrato nuevo enlazado, exige `expectedRevision` y fecha posterior al anterior; no copia asignaciones.
- `/finance-control/suppliers`: catálogo administrativo, edición con revisión. `GET /finance-control/cashflow?from=AAAA-MM-DD&to=AAAA-MM-DD`: pagos/reintegros efectivos, monedas separadas. `/cashflow/export` admite CSV y `format=pdf`.
- `POST /finance-control/payments/:id/reconcile`: importe exacto y referencia de comprobante. `GET/POST /finance-control/closes`: cierre de mes terminado, exige movimientos conciliados; cierre inmutable e impide nuevos pagos retroactivos en ese mes.
- `POST /auth/login` admite `recoveryCode` cuando hay MFA. Activar MFA o `POST /auth/mfa/recovery-codes` devuelve ocho códigos una sola vez. Regenerar exige contraseña/TOTP; el consumo es atómico y revoca las otras sesiones. `ADMIN_MFA_REQUIRED` limita rutas antes de configurar MFA.
- `GET /push/config`, `GET/POST /push/subscriptions`, `POST /push/unsubscribe`, `GET /push/deliveries`: sólo datos propios; endpoints de proveedores admitidos, consentimiento del navegador y colas sin contenido clínico.
- `GET /users?search=...`: busca nombre o usuario. `GET /system/status`: incluye cifrado del respaldo, cuota, retención y servicios configurados.
