# ORYX K9 · Actualización de identidad y control

Esta actualización conserva expedientes, usuarios, archivos y versiones históricas. La migración `202610170001_oryx_catalogs` añade los campos y catálogos sin reiniciar la instalación.

La migración complementaria `202610170002_oryx_scheduled_locations` actualiza el nombre de la unidad en las ubicaciones de las citas programadas; conserva los eventos históricos.

## Uso

- **Configuración → Control interno de datos:** ejecuta una revisión de identificadores, fechas de nacimiento, publicaciones, existencias y fechas de crianza. Muestra la hora de revisión y las incidencias encontradas.
- **Configuración → Registro de razas:** consulta, busca, añade, edita y archiva razas. Los formularios permiten elegir una raza o escribir una variedad; las nuevas entradas se incorporan al catálogo. La referencia factual incluye 364 razas FCI, cuatro variedades del pastor belga y mestizo. Los nombres ya registrados se conservan. Fuente y fecha en `assets/catalogs/breeds.json`.
- **Configuración → Plantillas:** 15 nuevas planillas para obediencia, socialización, detección, búsqueda y rescate, embajador canino, crianza, servicios médicos, charlas, municipalidades, servicios extraordinarios, entrega, inventario y acuerdos. Se pueden filtrar, previsualizar, editar y descargar en PDF. Los documentos ya emitidos conservan su contenido.
- **Expedientes:** el código, microchip y pedigrí se verifican antes de guardar. Los índices de PostgreSQL impiden duplicados también ante solicitudes simultáneas. El código ignora mayúsculas; chip y pedigrí también ignoran espacios y guiones. Los identificadores archivados siguen reservados.
- **Entrenamiento:** especialidades múltiples en el expediente y sugerencias de disciplina en sesiones y planes. Se admite una disciplina personalizada.
- **Venta y cruza:** se activan de forma independiente; ambas pueden coexistir con entrenamiento. El administrador controla la publicación, precio, moneda, contacto y textos visibles. El historial médico completo sigue reservado al propietario.
- **Crianza:** fecha del cruce, nacimiento previsto y entrega prevista. El estado indica si el cruce está programado o si ocurrió. Registrar nacimiento guarda la fecha real y cierra el plan. Los hitos aparecen en el calendario y generan avisos internos para administración; al cambiar o cerrar el plan se cancelan avisos pendientes que ya no correspondan.
- **Formularios:** el botón de ayuda abre las explicaciones de los campos. Los errores de identidad se indican junto al campo.

## Verificación reproducible

`npm run typecheck`, `npm run lint`, `npm test`, `node scripts/test-system.mjs` y `node scripts/local-build.mjs` verifican tipos, estilo, seguridad, API, navegador y compilación. Las pruebas de sistema crean una base separada y no escriben datos de prueba en la instalación de uso.

`tests/oryx.test.ts` cubre identificadores normalizados y concurrentes, catálogos, venta/cruza simultáneas, privacidad, fechas, nacimiento, recordatorios, PDF y permisos. `tests/e2e/oryx.spec.ts` comprueba identidad, controles, catálogos, descargas, ayuda, validación y ajuste móvil.

Validación local del 16 de octubre de 2026 (Costa Rica): 11 comprobaciones unitarias y de acceso compartido, 70 comprobaciones de API y 17 escenarios de navegador aprobados. La instalación conserva 30 perros, 10 cuentas y 39 documentos; dispone de 369 razas y variedades y 18 plantillas. Las siete comprobaciones del control interno devolvieron cero incidencias. El respaldo previo y el cifrado posterior verificaron los 43 archivos referenciados.

La conversión de fechas procesa sólo registros JSON y deja intactas las respuestas de archivos, flujos y datos binarios; una regresión cubre objetos de respuesta con referencias circulares y fechas sin desplazamientos de zona horaria.

La revisión interna identifica las reglas comprobadas; no sustituye la revisión de la información ingresada por los responsables. Correo y notificaciones del navegador requieren configurar sus respectivos servicios; los avisos internos funcionan de forma independiente.
