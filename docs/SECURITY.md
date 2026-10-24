# Seguridad y modelo de amenazas

La aplicación gestiona datos privados. La entrega para empresa comienza sin registros de negocio, con un administrador, catálogos de razas y plantillas, y la entidad técnica ORYX K9. Los controles descritos corresponden al código entregado y sus requisitos de operación; no constituyen auditoría independiente, certificación ni garantía legal. Consultar el reporte de pruebas para los controles efectivamente ejecutados y sus fechas.

## Controles de aplicación

- El catálogo anónimo usa selectores explícitos de campos comerciales. La publicación debe permanecer vigente tanto para la ficha como para su foto principal. No expone expedientes, titulares, chips ni archivos clínicos. Las consultas públicas requieren consentimiento y un medio de contacto, tienen límite persistente de frecuencia, señuelo antiautomatización e idempotencia. Sólo administración consulta solicitudes o aprueba cuentas; la aprobación crea exclusivamente CLIENT y se audita en una transacción. Las solicitudes no disparan mensajes externos automáticos.

- Cuentas internas creadas por administración, con nombre de usuario único independiente del correo opcional. Las solicitudes públicas de cuenta sólo producen un acceso después de aprobación administrativa. Bootstrap solicita una credencial propia; no instala contraseñas predeterminadas. La cuenta `admin` con clave `1234` se conserva por petición expresa del propietario. El iniciador no crea ni restablece esta cuenta automáticamente.
- El montaje de una base nueva usa el paso manual `setup:company`, que recibe la contraseña inicial mediante `BOOTSTRAP_PASSWORD` temporal. La excepción de contraseña inicial queda acotada a ese aprovisionamiento; no activa `DEMO_MODE` ni cambia la política general de la API. No guardar esa variable en `.env`, Git, imágenes o logs, y retirarla al finalizar. Ver [despliegue de servidor](DEPLOY_SERVER.md).
- Contraseñas Argon2id; con `DEMO_MODE=false`, las altas y los cambios de contraseña requieren de 12 a 128 caracteres. El inicio de sesión verifica el hash de la contraseña existente, por lo que el administrador conservado puede entrar con su clave inicial de cuatro caracteres. Preferir una frase larga y única para las nuevas credenciales. Limitación persistente por cuenta e IP para login/recuperación y ventanas temporales. No hay comprobación de contraseñas filtradas.
- Sesión aleatoria guardada como SHA-256 en PostgreSQL, caducidad, revocación al cerrar sesión/restablecer contraseña y rechazo de usuario inactivo. Cookie `HttpOnly`, `SameSite=Strict`; `Secure` requiere `COOKIE_SECURE=true` detrás de HTTPS.
- Protección CSRF en operaciones autenticadas mediante token de sesión, cookie y cabecera; validación de origen en mutaciones. El navegador usa un solo origen mediante Next.
- TOTP para `ADMIN`, secreto cifrado con AES-256-GCM usando `APP_ENCRYPTION_KEY`. La configuración `ADMIN_MFA_REQUIRED` permite exigirlo; cada administrador recibe ocho códigos de recuperación de un solo uso, guardados como hashes. Consumir uno revoca las otras sesiones y regenerarlos invalida los anteriores. No hay WebAuthn. Guardar los códigos en una custodia segura y no publicar el QR/URI ni el secreto.
- Recuperación por usuario con tokens aleatorios guardados como hash, vencimiento y consumo transaccional de un solo uso. El envío requiere correo asociado y SMTP funcional. La respuesta no confirma si existe una cuenta. Para cuentas sin correo, el superadministrador puede asignar una nueva contraseña desde Usuarios; se revocan sesiones y tokens de recuperación anteriores.
- DTO validados, acceso mediante Prisma y autorización en controladores. Contratos, finanzas, crianza y servicios se restringen a administración. Entrenadores sólo añaden salud y entrenamiento a perros asignados; clientes sólo consultan perros propios y publicaciones expresas. La custodia no concede permisos. Las exportaciones y descargas privadas se auditan.
- Archivos PDF/JPEG/PNG de hasta 10 MB, validación de cabecera/magic bytes, nombre interno generado y metadatos SHA-256. Las descargas pasan por el backend y se autorizan por categoría. No hay análisis antivirus ni sanitización de PDF: subir sólo documentación de origen conocido; incorporar cuarentena/escáner antes de permitir cargas de terceros.
- Auditoría de acciones sensibles. La API no ofrece edición/borrado de bitácora; las migraciones definen protección adicional de auditoría. Un administrador de base de datos sigue teniendo capacidad de alterar el sistema, por lo que no se promete evidencia criptográfica contra un administrador del host.
- La PWA no guarda expedientes privados para uso offline. No se implementa sincronización offline.

El backend no confía ciegamente en cabeceras `X-Forwarded-For`. En el despliegue detrás de Next, la IP registrada puede ser la del proxy y el límite por IP se comparte entre usuarios. Una futura configuración de proxies confiables debe restringir qué saltos pueden proporcionar la IP real; no habilitar `trust proxy` indiscriminadamente. La recuperación por correo se envía de forma síncrona y no tiene reintento persistente; revisar SMTP ante ausencia de mensaje.

## Amenazas y límites

| Amenaza                        | Control / respuesta                                             | Límite operativo                                             |
| ------------------------------ | --------------------------------------------------------------- | ------------------------------------------------------------ |
| Robo de contraseña             | Argon2id, límites de login, TOTP y códigos de recuperación      | Su exigencia depende de la configuración del operador        |
| Uso indebido de una sesión     | HttpOnly, SameSite, CSRF, caducidad, revocación                 | Un equipo desbloqueado permite operar como su usuario        |
| Acceso directo a API/documento | Guard y permisos de servidor; almacenamiento privado            | Roles dentro de una empresa, sin alcance por custodio        |
| Archivo malicioso              | Lista de tipos, límite, magic bytes, descarga controlada        | No equivale a antivirus; PDF puede contener contenido activo |
| Inyección/filtración           | Validación, ORM, exportación CSV con neutralización de fórmulas | Revisar nuevas consultas SQL y campos al ampliar módulos     |
| Pérdida del disco              | Respaldo DB+archivos, checksums, restauración aislada           | Requiere copia independiente y práctica periódica            |
| Robo del respaldo/PC           | BitLocker o LUKS y respaldo cifrado con age                     | Cifrado del volumen no lo activa la aplicación               |
| Omisión de recordatorios       | Cola persistente, worker, estados/intentos                      | Correo externo puede duplicarse; hay que vigilar fallos      |
| Abuso de administrador         | Cuentas personales y auditoría                                  | DBA/host tiene privilegios amplios; no hay WORM externo      |
| Exposición por red             | Servicios internos; Caddy TLS/VPN y firewall                    | TLS privado exige confiar CA en cada dispositivo             |

## Configuración necesaria

Mantener `.env`, `.local/`, backups y datos fuera de Git y de carpetas compartidas sin control. Restringir permisos NTFS en Windows y `chmod 600 .env` en Linux. Generar clave propia de 32 bytes para TOTP; perderla impide descifrar MFA. La rotación necesita un procedimiento que recifre secretos, no sustituir simplemente el valor.

El rol PostgreSQL creado por la imagen oficial tiene privilegios elevados para bootstrap/migraciones. Antes de un despliegue expuesto separar un rol migrador/propietario de un rol de aplicación con permisos mínimos; revisar funciones/triggers y verificar que no pueda alterar auditoría. La composición inicial prioriza instalación privada de una sola instancia y no implementa esa separación automáticamente.

Activar cifrado de disco (BitLocker/LUKS) y bloqueo de sesión del sistema. TLS protege tránsito; no implica cifrado de documentos a nivel de aplicación. S3, si se configura, necesita bucket privado, permisos mínimos, cifrado de almacenamiento y política de backup propia.

## Retención, incidentes y normativa

La eliminación de expedientes es lógica. No hay purga programada ni plazo de retención asumido. Definir por escrito responsables, finalidad, avisos/consentimientos, acceso, conservación y procedimiento privilegiado de eliminación. La revisión de normativa de protección de datos aplicable en Costa Rica queda pendiente con el responsable legal; no se afirma cumplimiento garantizado.

Ante incidente: restringir acceso de red, preservar evidencias/respaldos, deshabilitar cuentas comprometidas, rotar credenciales afectadas, revisar bitácora y probar restauración en ambiente aislado. No volcar datos de usuarios o secretos en tickets públicos. Mantener reporte de dependencias y atender actualizaciones de seguridad.

## Revisión de entrega

Los pagos, movimientos de stock y versiones contractuales tienen triggers que rechazan UPDATE/DELETE; las correcciones conservan historia. Reservas, asignaciones, pagos y consumos usan bloqueos transaccionales para proteger su integridad ante concurrencia. Las claves de petición evitan duplicar pagos y movimientos por reintentos. Las pruebas incluyen sobreabono, doble apartado, solapamientos y stock negativo concurrentes.

`infra/security/runtime-grants.sql` concede operaciones de runtime sin propiedad ni permisos de esquema y retira modificación/borrado sobre historiales. Requiere un rol previamente creado sin superusuario ni pertenencia a roles privilegiados; recibe su nombre como variable psql `runtime_role`. La prueba crea un rol aislado y verifica lectura/escritura permitida, denegación de ALTER/TRUNCATE, de manipulación de historiales y de acceso a migraciones. **No cambia automáticamente la cuenta PostgreSQL de la instalación local**. Aplicarlo en destino requiere separar las credenciales de migraciones y runtime, comprobar herencia de roles y repetir pruebas funcionales.

El monitor administrativo no expone secretos ni rutas de almacenamiento. Informa pulso del worker, atrasos y fallos, pero no vigila una PC apagada desde fuera.

Usar OWASP ASVS como guía de revisión: autenticación y sesiones, autorización, validación, archivos, datos y logging. Esta referencia es una guía de trabajo, no una declaración de conformidad ni una verificación exhaustiva. Pendientes en el destino real: pentest, revisión de campos clínicos/operativos, auditoría externa inmutable, configuración y comprobación de MFA, separación de roles DB, pruebas de carga y restauración periódica.

# Controles añadidos en las migraciones 009–010

MFA obligatorio opcional por instalación, recuperación mediante hashes de códigos de un solo uso, serialización de cambios de credenciales, revisiones médicas inmutables, adjuntos con comprobación de alcance, plantillas congeladas, conciliaciones y cierres protegidos. Web Push sólo admite proveedores autorizados y mensajes genéricos; datos clínicos no salen en la notificación.

Las copias locales pueden cifrarse con AES-256-GCM usando una clave independiente. El lanzador no entrega esa clave ni las conexiones de migración/respaldo a API/web/avisos. Las cargas pasan por cuota local y retención privada; ClamAV es una integración configurable, no un antivirus incluido. `DEMO_MODE=true` reduce a cuatro caracteres la política para datos sintéticos de prueba y no debe usarse en el servidor de empresa. La conservación o el aprovisionamiento manual de la contraseña inicial de `admin` no requiere habilitar ese modo.
