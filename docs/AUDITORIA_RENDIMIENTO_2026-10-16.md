# Depuración y rendimiento de ORYX K9

Revisión del 16 de octubre de 2026, horario de Costa Rica.

## Cambios comprobados

- Los módulos se descargan al abrirlos; el acceso inicial conserva solamente los componentes necesarios.
- Las consultas de fichas, listados y catálogos se cancelan al cambiar de pantalla. Una respuesta anterior no puede sustituir el resultado vigente.
- Las búsquedas de usuarios, contratos, inventario y selección de perros para citas esperan 250 ms de pausa al escribir.
- La galería consulta únicamente la pestaña abierta. Las fotografías de tarjetas se cargan al acercarse a la pantalla y se decodifican de forma asíncrona.
- Los avisos de crianza se incluyen en las notificaciones de administración. El contador cuenta todos los avisos pendientes del usuario; el listado permite recorrer páginas y ordena de forma estable los avisos con la misma fecha.
- Los cuatro conteos de perros del inicio se resuelven en una consulta. Se agregó un índice por usuario y lectura para el contador de avisos.
- Los formateadores de fechas se reutilizan y conservan la zona horaria de Costa Rica.
- Se corrigió el comando de pruebas de la API, que apuntaba a un archivo inexistente, y un texto de notificaciones que describía como pendiente una función implementada.

## Comparación en producción

Chromium local, contextos nuevos sin caché, pantalla de 390 × 844, mismos datos y cuentas ficticias, servidor en esta PC. Se mide la primera vista sin desplazamiento.

| Medición | Antes | Después | Reducción |
| --- | ---: | ---: | ---: |
| JavaScript inicial, bytes descomprimidos | 672.866 | 507.396 | 24,6 % |
| JavaScript inicial, bytes transferidos con cabeceras | 196.199 | 156.127 | 20,4 % |
| Datos iniciales de galería, bytes descomprimidos | 1.461.678 | 881.060 | 39,7 % |
| Solicitudes iniciales de galería, API y fotos | 14 | 8 | 42,9 % |
| Fotografías descargadas inicialmente | 12 | 7 | 41,7 % |
| Consultas para los cuatro conteos de perros | 4 | 1 | 75 % |

La reducción de fotografías afecta la carga inicial; las restantes se descargan al desplazarse. No se alteraron los originales ni sus permisos. La latencia del resumen en esta muestra pequeña no mejoró consistentemente; no se atribuye una ganancia de tiempo a ese cambio. Estas mediciones no equivalen a una prueba de carga con muchos usuarios.

Para repetir la medición, iniciar la versión de producción en `http://localhost:3000`, configurar `BENCHMARK_PASSWORD` con la contraseña de las cuentas de prueba y ejecutar `node scripts/benchmark-web.mjs etiqueta`. `BENCHMARK_ADMIN` y `BENCHMARK_CLIENT` permiten elegir sus usuarios. El comando sólo consulta los datos e inicia sesiones; guarda las medidas, sin contraseñas, en `.local/performance-etiqueta.json`.

## Validación

- TypeScript, ESLint y compilación de producción: correctos.
- 13 pruebas unitarias y del enlace temporal: correctas.
- 74 comprobaciones de integración del servidor: correctas.
- 20 escenarios de navegador: correctos al completar la repetición de las tres pruebas nuevas. La primera ejecución detectó una aserción demasiado estricta sobre el doble montaje de desarrollo de React; se corrigió para comprobar qué endpoints se consultan, conservando la prueba independiente de cancelación.
- Privacidad por usuario y rol, paginación de más de 20 notificaciones, fechas, respuestas obsoletas y separación de venta/preventa cubiertas por pruebas nuevas.
- Auditoría de dependencias de producción de npm: 0 vulnerabilidades conocidas al consultar.
- Restauración aislada: 12 archivos verificados; auditoría e historiales financieros y de inventario conservados; respaldo corrupto rechazado antes de modificar datos.
- Respaldo previo de la instalación: 43 archivos verificados. Datos de uso conservados: 30 perros, 10 cuentas y 39 registros documentales.
- Instalación activa: los siete controles internos sin incidencias, trabajador activo y sin avisos fallidos. Acceso administrativo y de entrenador comprobado.
- Enlace temporal: acceso de administrador y cliente, bloqueo anónimo, cookies seguras, fotos, preventa y vista móvil comprobados.

Los resultados corresponden a los casos ejecutados. No constituyen una garantía de ausencia de errores en escenarios no cubiertos.
