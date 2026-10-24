# Servidor propio y operación

Entrega preparada para una instalación nueva de la empresa: un administrador, 369 razas y 18 plantillas. Los perros, entrenamientos, camadas, clientes, contratos, finanzas, inventario y documentos comienzan vacíos. El repositorio no transporta la base ni los archivos privados de esta PC. El servidor, el dominio y los secretos se configuran en el destino.

## Preparación

Instalar Docker/Compose y Node.js para scripts operativos, almacenamiento cifrado y copias independientes. Mantener sistema actualizado, acceso administrativo restringido y hora sincronizada (TOTP depende de ella). Una distribución Linux soportada simplifica servicios continuos; Windows con Docker Desktop requiere revisar inicio de sesión, energía y continuidad operacional.

Copiar `.env.production.example` a `.env`. Generar dos valores independientes con `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`: uno para `POSTGRES_PASSWORD` y otro para `APP_ENCRYPTION_KEY`. Completar `ORYX_HOST`, `ACME_EMAIL` y `HTTPS_BIND_ADDRESS` con el dominio, contacto técnico y dirección de escucha elegidos. Mantener `DEMO_MODE=false`; dejar SMTP vacío hasta disponer del correo de la empresa. No copiar `.local`, respaldos, sesiones ni archivos del entorno de pruebas al servidor.

`compose.production.yaml` es un archivo separado, con PostgreSQL y API sin puertos del host. Sólo Caddy publica 80/443; por defecto se ligan a loopback. `COOKIE_SECURE=true` y origen HTTPS son forzados en esa composición. La imagen excluye las fotografías de ejemplo y los builds locales anteriores.

Para LAN/VPN usar `CADDY_CONFIG=./infra/Caddyfile.lan` y distribuir únicamente el certificado CA público a dispositivos autorizados. Para dominio público y ACME usar `./infra/Caddyfile`; DNS debe resolver al servidor y el método de validación elegido debe ser accesible. La apertura de puertos/DNS públicos es una decisión del propietario y no se ejecuta durante esta entrega. Es preferible mantener el sistema privado mediante VPN.

## Arranque

```sh
docker compose -f compose.production.yaml config --quiet
docker compose -f compose.production.yaml up -d --build
# Solicitar la contraseña sin escribirla en el historial de la terminal.
read -r -s -p 'Contraseña inicial de admin: ' BOOTSTRAP_PASSWORD
printf '\n'
export BOOTSTRAP_PASSWORD
docker compose -f compose.production.yaml exec -e BOOTSTRAP_PASSWORD api node /app/scripts/setup-company.mjs
unset BOOTSTRAP_PASSWORD
docker compose -f compose.production.yaml ps
```

La contraseña inicial acordada con el propietario es **1234**, con usuario **admin**. Introducirla cuando el comando anterior la solicite. El script no tiene contraseña predeterminada y se ejecuta una sola vez sobre una base vacía. Comprueba las migraciones, conserva la unidad técnica ORYX, completa las 18 plantillas y crea únicamente el administrador. Rechaza bases con usuarios o actividad operativa; no borra, reinicia ni reemplaza información. La aplicación no vuelve a ejecutar este instalador al arrancar.

`config --quiet` valida sintaxis sin imprimir secretos resueltos. Las migraciones se ejecutan antes de API/worker. Abrir el origen HTTPS exacto, iniciar sesión y crear personas, cuentas, perros y los demás registros desde los módulos internos. Las cuentas nuevas requieren contraseñas de al menos 12 caracteres; la excepción del administrador inicial no cambia esa política. Configurar los contactos públicos en **Solicitudes → Contacto y redes de la portada**; los campos vacíos se ocultan. Las solicitudes públicas de contacto o cuenta llegan a administración y sólo ésta aprueba cuentas.

Para instalación nativa, configurar PostgreSQL y `.env`, ejecutar `npm ci`, `npm run db:generate`, `npm run db:migrate` y `npm run setup:company` con `BOOTSTRAP_PASSWORD` suministrada por entorno temporal. Si se separan roles, `MIGRATION_DATABASE_URL` debe apuntar a la misma base con el propietario del esquema. El instalador no conecta a otra base si las conexiones no coinciden. Para un administrador con contraseña propia de 12 o más caracteres puede usarse alternativamente el asistente `npm run bootstrap`; no ejecutar ambos métodos.

Comprobación tras instalar: `GET /api/v1/health` devuelve `demoMode: false`; Usuarios muestra sólo `admin`; Configuración conserva 369 razas y 18 plantillas; expedientes, contratos, operaciones, finanzas e inventario están vacíos; el control interno no presenta incidencias. El catálogo público muestra sus estados vacíos hasta que administración publique perros o camadas. La unidad ORYX, las migraciones y la auditoría técnica de instalación no son registros comerciales de ejemplo.

Las imágenes usan versiones mayores mantenidas para facilitar actualizaciones de parche; antes de una entrega de producción, registrar digest de imágenes verificadas y congelarlo según la política del operador. No reemplazar una imagen PostgreSQL 17 por 18 apuntando al mismo volumen: la actualización mayor requiere pg_upgrade o exportación/restauración comprobada.

## Operación y actualización

Revisar a diario servicio `api`, `worker`, uso de disco, edad del último backup y errores de correo/recordatorios. Un healthcheck HTTP no demuestra que el correo se entregue o que haya espacio suficiente. Supervisar las tareas fallidas en base de datos/bitácora con una herramienta privada, sin publicar metadatos sensibles. No hay un servicio comercial de monitoreo obligatorio.

Antes de actualizar: respaldo coherente y prueba de restauración; revisar migraciones y changelog de dependencias. Construir versión nueva y ejecutar pruebas sobre una copia aislada. Después `docker compose -f compose.production.yaml up -d --build`. Conservar imágenes/versiones previas y snapshot. No asumir que una migración de esquema puede revertirse sólo cambiando la imagen.

## Lista de puesta en servicio

- [ ] Dominio/origen exacto, TLS confiable en cada dispositivo y cookies seguras.
- [ ] Firewall sólo LAN/VPN autorizada; base, API, almacenamiento y correo de prueba no publicados.
- [ ] Cuentas personales, mínimo privilegio, MFA administrativo y responsable de recuperación.
- [ ] SMTP real, remitente autorizado y prueba de recuperación/recordatorio.
- [ ] Volúmenes persistentes, cifrado de disco, ACL y capacidad vigilada.
- [ ] Backup cifrado independiente y restauración aislada verificada, con clave TOTP custodiada.
- [ ] Separación de rol PostgreSQL de migración/aplicación antes de exposición mayor.
- [ ] Pruebas prioritarias, móvil/LAN y reinicio del despliegue real registradas.
- [ ] Política de retención/eliminación y revisión legal aplicable pendientes de responsable.
- [ ] Revisión independiente de seguridad y mantenimiento asignado.

Esta lista no está marcada automáticamente: se completa con evidencias del entorno de destino. Ver [SECURITY](SECURITY.md) y [BACKUP_RESTORE](BACKUP_RESTORE.md).

Las pruebas del instalador se ejecutan contra PostgreSQL aislado en GitHub Actions, incluyendo una segunda ejecución denegada, concurrencia y reversión ante fallo. La construcción de los contenedores, DNS, TLS y correo del servidor elegido se verifican en ese destino; no se presentan como ejecutados en esta PC.
