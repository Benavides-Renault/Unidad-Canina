# Respaldo, restauración y traslado

Un respaldo completo incluye **PostgreSQL + archivos privados + custodia separada de secretos**. El repositorio, los contenedores y un dump sin documentos no bastan. Los scripts no exportan `.env` ni claves. Preservar `APP_ENCRYPTION_KEY` permite recuperar MFA; guardar credenciales de base y SMTP según la política del operador.

## Crear snapshot coherente

### Copia nativa en línea y diaria

La instalación de demostración activa usa `infra/backup/online.mjs`: exporta un snapshot PostgreSQL para que `pg_dump --snapshot` y la selección de documentos vean el mismo estado. Copia sólo los archivos referenciados por ese snapshot y comprueba sus hashes. El almacenamiento local de esta versión usa claves nuevas sin sobrescritura y archivo lógico; no usar este procedimiento si se cambia a borrado físico o archivos mutables.

`scripts/local-start.mjs` inicia `scripts/backup-worker.mjs` cuando `BACKUP_ENABLED=true`. Comprueba cada hora si corresponde una copia (24 horas desde el último éxito); reintenta tras fallo y no ejecuta dos copias a la vez. No registra tareas de Windows. Si la aplicación o la PC están apagadas, se retomará al siguiente arranque. Configuración muestra la última copia y deja de marcarla saludable si falla o tiene más de 26 horas.

Configuración: `BACKUP_DIRECTORY`, `BACKUP_STATUS_PATH`, `PG_BIN` y `BACKUP_DATABASE_URL` (rol de lectura sobre la misma base). `DATABASE_URL` queda para la aplicación; `MIGRATION_DATABASE_URL` permite migrar y crear la base aislada de restauración. El lanzador no entrega estas dos credenciales privilegiadas a la API. Para una copia inmediata:

```sh
node --env-file=.local/local.env scripts/backup-worker.mjs --once
```

Las copias siguen siendo locales y sin cifrar; la retención y copia externa protegida descritas abajo siguen pendientes. El cambio a demostración conservó además su configuración anterior en el respaldo previo: esos archivos `.env` contienen secretos y deben custodiarse como tales.

### Copia con escrituras pausadas

Los scripts usan Node.js, herramientas PostgreSQL y `tar`. En Windows `tar.exe` suele estar disponible; verificar `tar --version`. Los binarios `pg_dump`/`pg_restore` deben ser compatibles con el servidor; no usar pg_dump 17 contra PostgreSQL 18. En nativo puede definirse `PG_BIN` con la carpeta de binarios portátiles. Ejecutar desde la raíz del repositorio.

**Docker** (servicio PostgreSQL queda activo):

```sh
docker compose stop web api worker
node --env-file=.env infra/backup/backup.mjs --mode=docker --quiesced --output=backups/valkyr-2026-10-15
docker compose start api worker web
```

En producción agregar `--compose=compose.production.yaml` al script y `-f compose.production.yaml` a cada comando Compose. Si el respaldo falla, conservar evidencias y reiniciar los servicios manualmente; no considerar exitosa una carpeta sin `manifest.json` completo.

**Nativo:** detener API, web y worker; dejar PostgreSQL activo. Configurar `PG_BIN` si no está en PATH:

```sh
node --env-file=.local/local.env infra/backup/backup.mjs --mode=native --quiesced --output=backups/valkyr-2026-10-15
```

Usar `.env` en lugar de `.local/local.env` si la base es administrada manualmente. `--quiesced` confirma que el operador ha pausado escritores; el script no puede deducir si hay otros procesos externos escribiendo. Produce `database.dump` (pg_dump custom), `files.tar` y `manifest.json` con SHA-256 de ambos. Nunca sobrescribe el destino. Los checksums verifican corrupción, no autoría frente a un atacante que pueda sustituir también el manifiesto.

## Cifrar y retener

El script produce un snapshot sin cifrar para permitir verificación. Proteger la carpeta con ACL y cifrado de volumen. Si `age` está instalado y el propietario ha creado una clave privada custodiada por separado:

```sh
tar -cf backups/snapshot.tar -C backups valkyr-2026-10-15
age -r CLAVE_PUBLICA_AGE -o backups/snapshot.tar.age backups/snapshot.tar
```

Usar archivos explícitos evita corrupción por pipelines binarios en versiones antiguas de PowerShell. Verificar descifrado antes de retirar las copias sin cifrar mediante el procedimiento de retención. Ningún script elimina respaldos automáticamente. La clave privada age no debe estar en la misma unidad que la única copia del respaldo.

Política inicial a aprobar: copia diaria, 7 diarias, 4 semanales y 6 mensuales; al menos una copia cifrada independiente de la PC y una restauración mensual. Elegir plazos según necesidad operacional y retención de datos personales. Programar con Task Scheduler de Windows o un timer systemd en Linux y registrar resultado sin secretos. El repositorio no registra tareas del sistema automáticamente. El apagado de la PC impide el respaldo programado.

## Restaurar primero en un destino aislado

El script sólo acepta nombres `valkyr_restore_...`, crea una base nueva y exige un directorio de archivos inexistente. No usa `--clean`, no borra una base existente ni sobrescribe volúmenes. Verifica checksums antes de modificar, rechaza rutas de archivo inseguras y enlaces. Si algo falla puede dejar una base aislada parcial; revisarla y conservar diagnóstico, nunca apuntar producción a ella.

```sh
node --env-file=.local/local.env infra/backup/restore.mjs --mode=native --source=backups/valkyr-2026-10-15 --database=valkyr_restore_prueba --files=restores/prueba
```

Con Docker:

```sh
node --env-file=.env infra/backup/restore.mjs --mode=docker --source=backups/valkyr-2026-10-15 --database=valkyr_restore_prueba --files=restores/prueba
```

La base aislada se crea en el servidor configurado; los archivos se extraen a la carpeta nueva del host. Para validación funcional iniciar una **instancia temporal** en puertos separados, `DATABASE_URL` apuntando a `valkyr_restore_prueba`, `STORAGE_PATH` al directorio restaurado y la clave original; dejar el worker/correo desactivados para no duplicar envíos. Comprobar:

1. Recuentos de perros, documentos, vacunas, entrenamientos, usuarios y auditoría coinciden con el origen del snapshot.
2. Iniciar sesión con una cuenta existente, abrir un perro y descargar foto/documento; comparar checksum con `Document.checksum`.
3. Validar carné PDF y cronología. Comprobar que el acceso anónimo sigue denegado.
4. Confirmar último historial, fechas y migraciones aplicadas. No ejecutar nuevas migraciones hasta saber qué versión del código corresponde al snapshot.
5. Anotar fecha, versión PostgreSQL, commit/lockfile, duración y resultados. Consultar el reporte de pruebas de esta entrega para lo ejecutado realmente.

## Pasar de PC a servidor

Preparar destino sin abrirlo al equipo: mismo código/lockfile, PostgreSQL de la misma versión mayor o una superior soportada, disco cifrado, espacio y TLS. El runtime portátil usa PostgreSQL 18.x, mientras Compose predetermina 17: para trasladar desde el portátil usar destino PostgreSQL 18 compatible y **ajustar la imagen antes de iniciar un volumen nuevo**, o planificar una migración lógica revisada. No se promete restaurar un dump 18 en 17.

Pausar escrituras en origen, generar/cifrar snapshot, transferir por canal seguro y restaurar en base/directorio nuevos. Transferir secretos por canal separado. Validar recuentos y archivos antes de cambiar URL/DNS y configurar el worker. Con almacenamiento Docker, copiar el directorio validado a un volumen nuevo montado en `/data/files` y ajustar propietario a UID 1000 del contenedor; no montar una carpeta Windows con permisos amplios como destino final. Conservar el origen apagado y el snapshot hasta aceptar la migración. Activar envíos sólo en una instalación.

La promoción a instalación activa es deliberadamente manual: configurar `DATABASE_URL`/volumen correspondientes, reiniciar y repetir pruebas. No se entrega un comando que destruya o reemplace la base de producción. Revertir apunta nuevamente al origen conservado; los cambios escritos después del corte requieren conciliación.

## Comprobación ampliada de fases 2 y 3

`node scripts/test-backup.mjs` restaura la última base sintética de `test:system` en otra base nueva. Compara recuentos de 36 tablas, incluyendo seguimiento, contratos/versiones, genealogía/camadas, apartados/cuentas/pagos y productos/lotes/movimientos. Verifica bytes contra checksums de Document, ContractFile y AccountFile; comprueba triggers de auditoría, versiones, pagos, stock y evaluaciones, saldos financieros exactos y cantidades de lote contra la suma de movimientos. Una copia corrupta debe rechazarse antes de crear el destino. `scripts/test-online-backup.mjs` valida el snapshot con una carga simultánea; `scripts/test-demo-recovery.mjs` compara el contenido exacto de 32 tablas de negocio y 10 adjuntos de la demostración restaurada.

La evidencia de esta prueba no respalda por sí sola datos posteriores de la instalación de uso. Antes de cada actualización, generar además su snapshot con escritores detenidos. El dump contiene el esquema completo y todos sus registros, aunque el test compare una selección explícita de tablas.

## Cifrado de la instalación local

El trabajador diario cifra las copias cuando existe `BACKUP_ENCRYPTION_KEY` (32 bytes hexadecimales). El destino contiene tres archivos `.enc` y `envelope.json`; la clave se conserva en `.local/local.env`, fuera de la carpeta de copias. No compartir ese archivo como un reporte. Los respaldos anteriores y los de mantenimiento previo se conservan sin reemplazarlos.

Para descifrar a una carpeta nueva, con la configuración local cargada por el script:

```sh
node scripts/backup-crypt.mjs --decrypt --source=RUTA_COPIA_CIFRADA --output=RUTA_NUEVA
```

La restauración acepta el resultado descifrado y sigue exigiendo una base `valkyr_restore_*` y una carpeta inexistente. `scripts/test-demo-recovery.mjs` descifra y restaura una copia activa de forma aislada, compara 40 tablas de negocio y verifica cada objeto. `scripts/test-encrypted-backup.mjs` comprueba además clave incorrecta y alteración autenticada. Custodiar la clave y `APP_ENCRYPTION_KEY` fuera del disco antes de depender de una copia externa.

## Almacenamiento S3 opcional

`online.mjs` admite S3: toma la lista de objetos y el dump del mismo snapshot, descarga las claves inmutables, valida checksums y genera una copia portable que puede restaurarse a almacenamiento local. El adaptador está probado mediante cliente de objetos inyectado. Deben validarse bucket privado, permisos, cuota del proveedor y recuperación real antes de cambiar esta instalación a S3. No se afirma que un bucket externo haya sido probado ni se usa su versionado como sustituto del respaldo.
