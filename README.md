# ORYX K9 · Unidad Canina

Identidad renovada, catálogo de razas, disponibilidad independiente para venta y cruza, fechas de crianza simplificadas y control interno. Consulta [la actualización y su verificación](docs/ORYX_CONTROL.md).

Gestión privada de ORYX K9 UNIDAD CANINA. Next.js/React + NestJS + PostgreSQL/Prisma, con acceso por usuario, expedientes caninos, contratos, operaciones, crianza, apartados, cuentas e inventario persistentes. El [alcance del producto](docs/PRODUCT_SPEC.md), la [hoja de ruta](docs/ROADMAP.md) y los [resultados de verificación](docs/TEST_REPORT.md) describen la instalación vigente.

El logo maestro en `assets/branding/oryx-logo.png` conserva el archivo entregado. La portada pública muestra perros en venta y camadas, permite consultas sin cuenta y recibe solicitudes de cuenta que administración debe aprobar. El acceso privado utiliza nombres de usuario; el correo es opcional para recuperación y avisos. No hay integración fiscal ni datos reales precargados.

Los accesos vigentes son **Administrador**, **Entrenador** y **Cliente**. Cada entrenador trabaja sólo con los perros asignados; cada cliente consulta sus perros y la galería de venta/preventa autorizada. Administración define propietario, custodio, entrenador y publicaciones. Consulta la [guía de uso](docs/USER_GUIDE.md).

## Abrir en esta PC

La instalación activa contiene 10 cuentas, 30 perros con fotos, camadas, entrenamiento, salud, contratos, cuentas e inventario. Acceso principal: **admin / 1234**; todas las cuentas de prueba usan **1234**. Consulta [los usuarios y el recorrido](docs/DEMO_ACCESOS.md). La entrega incorpora clínica versionada, comprobantes, plantillas, renovaciones, proveedores, conciliación/cierres, preferencias de avisos y [respaldo cifrado y controles locales](docs/PHASE_4_LOCAL.md). Los datos anteriores permanecen conservados aparte.

La instalación local ya está preparada, con el usuario **admin** creado para las pruebas solicitadas por el propietario. Abre **INICIAR_ORYX_K9.cmd** y después [ORYX K9 local](http://localhost:3000). Dentro de **Administración → Usuarios → Crear usuario**, crea los accesos de los socios con nombre, usuario, contraseña y rol; no requieren correo. **Editar usuario** permite cambiar contraseñas, roles y estado. Mantén la consola abierta mientras uses la aplicación; Ctrl+C detiene los servicios iniciados por ella conservando los datos. El iniciador utiliza el Node compatible incluido en esta PC cuando está disponible, sin cambiar la instalación global.

También puedes usar `npm run local` con Node 24 LTS. El iniciador aplica migraciones y usa la compilación de producción; requiere dependencias y compilación previamente preparadas. La base local conserva la cuenta de prueba y está separada de las bases sintéticas de verificación. La clave de prueba se configuró solo en esta PC: no se crea automáticamente al instalar, iniciar o migrar. Antes de uso real, cambia esa clave desde Usuarios. En una instalación nueva sin cuentas, el asistente solicita nombre, usuario y contraseña propia del administrador. Consulta [los resultados y límites verificados](docs/TEST_REPORT.md).

## Compartir una visita desde esta PC

`COMPARTIR_ORYX_K9.cmd` genera un enlace HTTPS público al catálogo y una invitación separada al espacio privado. Ambos funcionan mientras esta PC y ORYX K9 estén encendidos. `DETENER_ENLACE_ORYX_K9.cmd` revoca el acceso sin detener la aplicación local. Consulta [la guía para compartir](docs/SHARING.md); la invitación y los archivos locales no forman parte del repositorio.

## Inicio con Docker

Requiere Docker Desktop con WSL2 en Windows, o Docker Engine + Compose v2 en Linux. Los comandos se ejecutan desde este directorio.

1. Copiar `.env.example` a `.env` (`Copy-Item .env.example .env` en PowerShell; `cp .env.example .env` en Linux).
2. Generar **dos valores distintos**: `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Usar uno como `POSTGRES_PASSWORD` y otro como `APP_ENCRYPTION_KEY`. No compartirlos ni guardarlos en Git. Para Compose usar una contraseña hexadecimal evita ambigüedades en la URL interna.
3. Ejecutar:

```sh
docker compose up -d --build
docker compose exec api npm run bootstrap
```

El asistente solicita nombre, usuario y contraseña del primer administrador. No crea cuentas de demostración. Abrir [ORYX K9 local](http://localhost:3000); [Mailpit](http://localhost:8025) muestra los correos de prueba. La interfaz y los correos de prueba están ligados a loopback. PostgreSQL se liga a `127.0.0.1:5433` para desarrollo; no se publica a la LAN.

```sh
docker compose logs --tail=100 api worker
docker compose stop
docker compose start
```

Para actualizar: crear/verificar respaldo, revisar migraciones y `docker compose up -d --build`. **No usar `down -v`**: eliminaría los volúmenes. `docker compose down` conserva volúmenes, pero no es una política de respaldo.

## Desarrollo nativo

Requiere Node.js 22.13 o posterior compatible (recomendado 24 LTS) y PostgreSQL. `package-lock.json` fija las versiones efectivamente instaladas; los `package.json` describen cada workspace. Ver [DEPLOY_LOCAL](docs/DEPLOY_LOCAL.md) para detalles de Windows y Linux.

```sh
npm ci
npm run db:local
```

Mantén esa primera terminal abierta. En **otra terminal** dentro del mismo directorio:

```sh
npm run db:generate
npm run db:migrate
npm run bootstrap
npm run build
npm run dev
```

`db:local` inicia PostgreSQL portátil en loopback:55432, genera credenciales aleatorias y escribe configuración privada en `.local/local.env`. El wrapper portátil usa PostgreSQL 18.x mediante `embedded-postgres` (distribución beta); Compose usa PostgreSQL 17. No reutilizar un directorio de datos entre versiones mayores. Los scripts de raíz cargan `.env` y después `.local/local.env`; `dev` inicia API compilada, worker y Next. Recompilar backend después de editarlo. Para usar PostgreSQL propio, configurar `.env` y no iniciar `db:local`; ver [DEPLOY_LOCAL](docs/DEPLOY_LOCAL.md). Usar `APP_ORIGIN=http://localhost:3000` y abrir exactamente esa URL.

## Verificación

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

Las pruebas que requieran servicios usan una base de datos de prueba aislada; nunca deben apuntar a una instalación real. El reporte de ejecución de la entrega distingue resultados ejecutados, limitaciones y tareas pendientes. La presencia de archivos Docker o CI no demuestra que se hayan ejecutado en este equipo.

`npm run test:system` crea una base sintética nueva, arranca API e interfaz de prueba y ejecuta integración y Playwright; requiere PostgreSQL activo y Chromium (`npx playwright install chromium`). `node scripts/test-bootstrap.mjs` comprueba la creación segura del primer administrador. `npm run test:backup` respalda/restaura la última base sintética; necesita `pg_dump`, `pg_restore` y `createdb` de la misma versión mayor o compatibles en `PG_BIN`/PATH. `npm run db:stop` detiene ordenadamente sólo la base portátil del proyecto.

## Documentación

- [Arquitectura y decisiones](docs/ARCHITECTURE.md), [ERD](docs/ERD.md), [contrato API](docs/API_CONTRACT.md).
- [Seguridad y amenazas](docs/SECURITY.md), [roles](docs/ROLES.md), [variables](docs/ENVIRONMENT.md).
- [Windows/Linux local y LAN](docs/DEPLOY_LOCAL.md), [servidor HTTPS](docs/DEPLOY_SERVER.md), [respaldos y recuperación](docs/BACKUP_RESTORE.md).
- [Manual de uso](docs/USER_GUIDE.md), [hoja de ruta](docs/ROADMAP.md), [Repositorio y publicación](docs/GITHUB.md).

Los documentos clínicos son registros internos, no certificaciones oficiales. La PWA requiere contexto seguro para su instalación en dispositivos remotos y no ofrece edición ni sincronización offline. El código está publicado en [GitHub](https://github.com/Benavides-Renault/Unidad-Canina) y la visita remota utiliza un enlace temporal desde esta PC. No hay un alojamiento permanente contratado.
