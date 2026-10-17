# Servidor propio y operación

No se ha desplegado ni abierto puertos externos. La siguiente guía requiere un equipo que el propietario elija; no supone sistema operativo, recursos o dominio ya disponibles. Para una instalación pequeña, empezar midiendo uso de CPU/RAM/almacenamiento con una carga representativa antes de definir capacidad; documentos e imágenes suelen determinar crecimiento.

## Preparación

Instalar Docker/Compose y Node.js para scripts operativos, almacenamiento cifrado y copias independientes. Mantener sistema actualizado, acceso administrativo restringido y hora sincronizada (TOTP depende de ella). Una distribución Linux soportada simplifica servicios continuos; Windows con Docker Desktop requiere revisar inicio de sesión, energía y continuidad operacional.

Crear `.env` de producción con secretos propios, `ORYX_HOST`, `ACME_EMAIL`, SMTP real y `HTTPS_BIND_ADDRESS` correspondiente a IP privada/VPN. `compose.production.yaml` es un archivo separado, con PostgreSQL y API sin puertos del host. Sólo Caddy publica 80/443; por defecto se ligan a loopback y no se abre Internet automáticamente. `COOKIE_SECURE=true` y origen HTTPS son forzados en esa composición.

Para LAN/VPN usar `CADDY_CONFIG=./infra/Caddyfile.lan` y distribuir únicamente el certificado CA público a dispositivos autorizados. Para dominio público y ACME usar `./infra/Caddyfile`; DNS debe resolver al servidor y el método de validación elegido debe ser accesible. La apertura de puertos/DNS públicos es una decisión del propietario y no se ejecuta durante esta entrega. Es preferible mantener el sistema privado mediante VPN.

## Arranque

```sh
docker compose -f compose.production.yaml config --quiet
docker compose -f compose.production.yaml up -d --build
docker compose -f compose.production.yaml exec api npm run bootstrap
docker compose -f compose.production.yaml ps
```

`config --quiet` valida sintaxis sin imprimir secretos resueltos. Migraciones se ejecutan antes de API/worker. Bootstrap sólo para una base nueva; en un traslado restaurar usuarios existentes. Abrir el origen HTTPS exacto, configurar MFA administrativo y probar correo real sin datos personales innecesarios.

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
