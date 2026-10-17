# Instalación en PC y acceso privado

## Windows: Docker Desktop + WSL2

1. Verificar virtualización habilitada y WSL2 mediante `wsl --status`. Si falta, el propietario instala/habilita WSL2 y Docker Desktop siguiendo su distribución y reinicia cuando se solicite. Este repositorio no cambia componentes del sistema automáticamente.
2. En Docker Desktop seleccionar motor WSL2 y contenedores Linux. Comprobar `docker version` y `docker compose version` desde PowerShell.
3. Abrir PowerShell en el repositorio. `Copy-Item .env.example .env`. Generar dos secretos independientes como explica README y completar `.env`.
4. `docker compose up -d --build`; luego `docker compose exec api npm run bootstrap` y abrir `http://localhost:3000`.
5. `docker compose ps` y `docker compose logs --tail=100 api worker` permiten diagnosticar. No compartir logs sin revisarlos. Mailpit de desarrollo: `http://localhost:8025`.

Los volúmenes viven en Docker Desktop/WSL2. Copiar sólo el repositorio **no** copia datos. Respaldar con los scripts documentados antes de mover/reinstalar Docker. El arranque de Windows no garantiza que Docker, la PC o el worker estén activos: revisar la configuración de inicio y energía.

## Linux: Docker Engine

Instalar Docker Engine y el plugin Compose v2 mediante los paquetes adecuados para la distribución. Verificar `docker version`/`docker compose version`. Copiar `.env`, restringir permisos (`chmod 600 .env`), completar secretos y ejecutar los mismos comandos. Pertenecer al grupo Docker equivale prácticamente a acceso administrador del host: limitar integrantes. No montar el socket Docker en la aplicación.

## Alternativa nativa disponible en este repositorio

Si Docker no está disponible, Node y el runtime PostgreSQL portátil permiten probar en la PC:

En la PC de entrega, `INICIAR_VALKYR.cmd` ya reúne el arranque y usa la cuenta `admin` de pruebas solicitada por el propietario. En una base nueva sin cuentas, abre el asistente inicial para elegir nombre de usuario y contraseña. Para una instalación desde el código, seguir los pasos siguientes. No copiar `.env.example` a `.env` para la modalidad portátil: ese archivo corresponde a configuración manual/Docker y tiene prioridad sobre `.local/local.env`.

```sh
npm ci
npm run db:local
```

Dejar esa terminal abierta. En una segunda terminal:

```sh
npm run db:generate
npm run db:migrate
npm run bootstrap
npm run build
npm run dev
```

Después del primer montaje puede usarse `npm run local` (compilación de producción) o el iniciador de Windows. Detención de PostgreSQL portátil: `npm run db:stop`. Se utiliza `pg_ctl` para cierre ordenado.

El script local escribe credenciales aleatorias en `.local/local.env`, base persistente en `.local/` y escucha PostgreSQL únicamente en `127.0.0.1:55432`. No hay contraseña predeterminada. Esta ruta usa la distribución portátil `embedded-postgres` beta con PostgreSQL 18.x; para operación sostenida preferir una distribución PostgreSQL administrada o Docker. No utilizar archivos físicos de PostgreSQL 18 en PostgreSQL 17 ni prometer downgrade del respaldo.

Al editar backend, recompilar antes de reiniciar `dev`. La interfaz se abre en `http://localhost:3000`; API nativa en loopback:4000. Los recordatorios requieren que el worker siga ejecutándose. La aplicación nativa no se instala como servicio del sistema automáticamente. Detener los procesos con Ctrl+C; usar los comandos de base local que ofrece `package.json` para cierre ordenado, sin terminar abruptamente el proceso de base.

Para PostgreSQL ya instalado: crear base/usuario privados, definir `DATABASE_URL` en `.env`, `STORAGE_PATH` absoluto y `APP_ENCRYPTION_KEY`; ejecutar generación, migraciones y bootstrap. No iniciar `db:local` en esa modalidad. No ejecutar simultáneamente API nativa y API Docker sobre puertos y datos equivalentes.

## Socios en LAN mediante HTTPS privado

La configuración inicial sólo admite acceso desde la PC. Para LAN, usar `compose.production.yaml` con `CADDY_CONFIG=./infra/Caddyfile.lan`, `VALKYR_HOST=valkyr.lan` (o nombre DNS privado real) y `HTTPS_BIND_ADDRESS` igual a la IP LAN específica de la PC. Configurar resolución del nombre en DNS local o archivo hosts de cada cliente y permitir 443 únicamente desde la subred privada elegida en el firewall. El origen de aplicación será `https://valkyr.lan`; Compose activa cookies seguras.

```sh
docker compose -f compose.production.yaml up -d --build
docker compose -f compose.production.yaml exec api npm run bootstrap
```

Esta composición usa volúmenes **diferentes** de desarrollo. Si ya hay datos, realizar traslado/restauración; no crear cuentas o reingresar perros para simular que se migraron.

Caddy genera una CA privada: exportar su certificado **público** raíz desde `/data/caddy/pki/authorities/local/root.crt` en el contenedor y confiarlo en cada dispositivo autorizado. Nunca distribuir `root.key`. El certificado de servidor puede ser válido para esos dispositivos después de configurar la confianza; sin ello el navegador mostrará error y ciertas capacidades PWA fallarán. No desactivar validación de certificados como solución permanente.

No publicar 5432/5433, 4000, almacenamiento o Mailpit a la LAN. Verificar desde otro dispositivo autorizado login, consulta, carga y descarga. Registrar navegador/versión y resultados. Restringir reglas del firewall al perfil privado y subred real; no abrir puertos en el router. La aplicación debe disponer de DNS/IP estables.

## Actualizar la instalación nativa sin reemplazar el build activo

Con Node compatible, ejecutar `node scripts/local-build.mjs`. Compila API y web; la web queda en `.next-release-<marca>` y se registra en `.local/pending-release.json`. El iniciador usa `.local/active-release.json` si existe; en una instalación anterior usa `.next`. `VALKYR_NEXT_DIR` permite una selección explícita. No cambiar el archivo activo antes de que la compilación termine.

Para activar: detener únicamente web/API/worker de VALKYR, mantener PostgreSQL, crear snapshot coherente según BACKUP_RESTORE, aplicar `npm run db:migrate` y copiar pending-release.json a active-release.json. Iniciar con **INICIAR_VALKYR.cmd**, verificar `/api/v1/health`, iniciar sesión y revisar los módulos. Conservar el respaldo y el build anterior. El directorio API `dist` se recompila al preparar la versión; una reversión de código exige reconstruir esa versión compatible con su esquema, no sólo cambiar el puntero web.

La prueba `test:system` usa puertos 3100/4001, base `valkyr_test_*` y build `.next-test`; no reemplaza `.next` ni la base de uso. No ejecutar dos compilaciones web a la vez: Next genera archivos de tipos en el proyecto.

## Acceso remoto privado

Preferir VPN privada administrada (WireGuard o Tailscale, si el propietario elige ese proveedor) y permitir tráfico sólo desde la VPN. No instalar ni contratar servicios de terceros automáticamente. Mantener HTTPS, cuentas individuales y MFA administrativo incluso dentro de VPN. Las notificaciones push no están implementadas; HTTPS por sí solo no las habilita. La PWA no tiene edición offline.
