# Operación en esta PC

`INICIAR_ORYX_K9.cmd` inicia PostgreSQL portátil, API, web y trabajadores. Los datos persisten entre reinicios. Los trabajadores funcionan mientras el lanzador permanece abierto.

## Permisos y recuperación de acceso

Aplicación, migraciones y respaldo usan roles PostgreSQL distintos. El lanzador reaplica los permisos después de migrar. API, web y avisos no reciben las credenciales de migración/respaldo ni la clave de cifrado de copias. Los historiales protegidos tampoco admiten modificación desde la cuenta de aplicación.

`ADMIN_MFA_REQUIRED=true` limita al administrador a configurar MFA antes de consultar los módulos. La activación genera ocho códigos; sólo se guardan hashes. El consumo es atómico y revoca las otras sesiones. Esta instalación de prueba mantiene MFA opcional.

## Respaldo y archivos

`backup-worker.mjs` crea una copia cada 24 horas. Dump y lista de archivos comparten snapshot PostgreSQL; se verifican SHA-256. `BACKUP_ENCRYPTION_KEY` activa AES-256-GCM con IV aleatorio y autenticación por archivo, incluido el manifiesto. El estado sólo indica éxito tras finalizar la copia. Las copias históricas sin cifrar se conservan.

El destino contiene `database.dump.enc`, `files.tar.enc`, `manifest.json.enc` y `envelope.json`. La clave permanece en la configuración privada, fuera de esas carpetas. Custodiar claves/configuración fuera del mismo disco cuando se prepare una copia externa. [BACKUP_RESTORE.md](BACKUP_RESTORE.md) contiene los comandos.

`STORAGE_QUOTA_MIB` limita el almacenamiento local con escrituras serializadas. Los comprobantes aceptan PDF/PNG/JPEG y MP4 sólo en sesiones/evaluaciones, hasta 25 MB; las cargas generales mantienen 10 MB. Las cargas pasan por cuarentena privada. Si `UPLOAD_SCANNER_PATH` apunta a `clamscan`, sólo se publican si el analizador termina correctamente; un fallo retiene el archivo. Sin motor configurado se valida formato y se rechaza la firma EICAR, sin afirmar análisis antivirus completo. El monitor muestra cuota, espacio y retenciones.

S3 usa claves inmutables y exporta sus objetos a la misma copia portable. El adaptador se verifica con objetos simulados; restaurar esa copia genera almacenamiento local. El bucket real se valida cuando se configure.

## Avisos

Correo y push tienen preferencias por cuenta. El correo usa SMTP e identificador estable. Web Push solicita permiso al pulsar Activar y sólo muestra que existe una notificación; los datos privados permanecen dentro de la aplicación. La cola evita duplicados, reclama trabajos con bloqueo SQL, recupera trabajos abandonados y reintenta hasta cinco veces. Desactiva suscripciones caducadas; cerrar sesión desuscribe el navegador.

Configurar VAPID con `node scripts/configure-push.mjs --subject=mailto:CONTACTO_TECNICO` y reiniciar. SMTP/VAPID permanecen sin activar hasta indicar un proveedor/contacto real. Las pruebas utilizan receptor SMTP local y transporte push simulado, sin mensajes externos. Aceptación por un servicio push no equivale a lectura por una persona.

Los límites fuera de esta PC se detallan en [ROADMAP.md](ROADMAP.md).
