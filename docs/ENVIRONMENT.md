# Variables de entorno

Los archivos `.env` y `.local/local.env` son privados. Nunca pegarlos en un ticket o enviar `docker compose config` con valores resueltos a un chat público. El archivo `.env.example` no contiene credenciales utilizables.

| Variable                                                     | Uso                                                                                                                                                               |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                               | Conexión PostgreSQL. Nativa: host/puerto de la instancia propia. Compose usa nombre interno `postgres` y construye su valor desde `POSTGRES_*`.                   |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`          | Bootstrap de PostgreSQL en Compose. Usar contraseña aleatoria hexadecimal; modificar el archivo después no cambia una contraseña de un volumen ya inicializado.   |
| `APP_ORIGIN`                                                 | Origen exacto del navegador, sin barra final: `http://localhost:3000` o `https://host`. Interviene en enlaces y protección de origen.                             |
| `API_HOST`, `API_PORT`                                       | Escucha del backend; nativo loopback, contenedor `0.0.0.0:4000` sin publicar a la LAN.                                                                            |
| `API_URL`                                                    | Destino interno del proxy Next; nativo `http://127.0.0.1:4000`, contenedor `http://api:4000`. Se usa al compilar; reconstruir web al cambiarlo.                   |
| `APP_ENCRYPTION_KEY`                                         | 64 caracteres hexadecimales aleatorios. Cifra secretos TOTP. Guardar copia cifrada separada. No reemplazar en una instalación existente sin migración de claves.  |
| `COOKIE_SECURE`                                              | `false` únicamente en HTTP localhost; `true` para HTTPS.                                                                                                          |
| `SESSION_TTL_HOURS`                                          | Caducidad de sesión en horas, valor inicial 12.                                                                                                                   |
| `STORAGE_DRIVER`                                             | `local` por defecto. `s3` requiere validar el proveedor, bucket y backups. Compose entregado fija `local`.                                                        |
| `STORAGE_PATH`                                               | Directorio privado absoluto en nativo, `/data/files` en Compose. API y worker deben compartir configuración.                                                      |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`                      | Destino de almacenamiento opcional. Nunca usar bucket público.                                                                                                    |
| `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_FORCE_PATH_STYLE`      | Credenciales mínimas y compatibilidad de S3. No las utiliza la instalación local predeterminada.                                                                  |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`                      | Servidor de correo. Mailpit local: puerto 1025 sin TLS; producción según proveedor, con TLS donde corresponda.                                                    |
| `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`                    | Credenciales/remitente SMTP. No dejar Mailpit como envío real en producción.                                                                                      |
| `ORYX_HOST`, `ACME_EMAIL`                                  | Dominio/nombre del host y correo para Caddy con certificados públicos.                                                                                            |
| `CADDY_CONFIG`                                               | `./infra/Caddyfile` público o `./infra/Caddyfile.lan` para CA privada.                                                                                            |
| `HTTPS_BIND_ADDRESS`                                         | IP específica privada/VPN del host para publicar Caddy. Por defecto `127.0.0.1`; no se abre Internet automáticamente.                                             |
| `BOOTSTRAP_USERNAME`, `BOOTSTRAP_NAME`, `BOOTSTRAP_PASSWORD` | Alternativa no interactiva para bootstrap, sólo durante instalación. Preferir asistente, limpiar variables después y no incluir contraseña en comandos/historial. |
| `PG_BIN`                                                     | Carpeta de `pg_dump`, `pg_restore`, `createdb` para scripts nativos de backup. Debe corresponder a una versión compatible con el servidor.                        |

Para configuración nativa generada, los scripts de raíz cargan los archivos de entorno. Para scripts de respaldo independientes usar `node --env-file=.local/local.env ...` o `node --env-file=.env ...` según la instalación. No combinar configuraciones de dos bases por accidente.

`ORYX_NEXT_DIR` selecciona el directorio de compilación de Next. Las pruebas usan `.next-test`; `scripts/local-build.mjs` genera `.next-release-<marca>`. El iniciador lee `.local/active-release.json` cuando no existe esta variable. Los nombres admitidos comienzan por `.next` y no pueden contener separadores de ruta. Los archivos active/pending no contienen credenciales y son locales a la instalación.
