# Verificación de ORYX K9

La aplicación utiliza tres tipos de cuenta: administración, entrenador y cliente. Los resultados de rendimiento y las condiciones de medición están en [la auditoría del 16 de octubre](AUDITORIA_RENDIMIENTO_2026-10-16.md).

## Última verificación completa publicada

El commit `0f6b5b5bfd041fe7a0e0800692a3249b557c02c1` completó [la verificación automática de GitHub](https://github.com/Benavides-Renault/Unidad-Canina/actions/runs/39899988812) el 22 de octubre de 2026 (Costa Rica): tipos, análisis estático, compilación de producción, 16 pruebas unitarias y de integridad, 82 comprobaciones de API y 39 escenarios de navegador. Las 137 pruebas pasaron en una misma ejecución sobre Node 24 y una base aislada.

En una verificación anterior, la restauración aislada comprobó 12 archivos, preservó la auditoría y los historiales financieros y rechazó respaldos corruptos. En ese momento la instalación de uso conservaba 30 perros, 10 cuentas y 39 registros documentales, y sus siete controles internos no encontraron incidencias. La revisión del 22 de octubre no vuelve a certificar esos recuentos de la instalación activa.

## Cómo repetir las comprobaciones

- `npm run typecheck`, `npm run lint` y `npm test` revisan tipos, estilo, integridad, sesiones, enlace temporal y limpieza del repositorio.
- `node scripts/local-build.mjs` prepara una compilación separada sin reemplazar la versión web activa.
- `npm run test:system` crea una base nueva de pruebas, utiliza los puertos 4001/3100 y ejecuta API y navegador. No reinicia ni rellena la base de uso.
- `npm run test:backup` verifica una restauración aislada de la última base de pruebas.
- `node scripts/test-encrypted-backup.mjs` comprueba cifrado, integridad, restauración y exportación de objetos con un cliente de almacenamiento simulado.
- `node scripts/test-share.mjs` comprueba el enlace temporal activo con las cuentas ficticias autorizadas.

Las evidencias locales se guardan en `.local` y no se publican junto al código. Cada actualización debe registrar sus propios resultados y conservar un respaldo antes de activarse.

## Limpieza de identidad

Se incorporó una prueba que impide volver a añadir nombres de archivo, logos o referencias vigentes de la marca anterior. Las únicas excepciones son migraciones ya aplicadas, lectores de formatos anteriores, reconocimiento de instalaciones existentes y pruebas de esa compatibilidad. Los nuevos paquetes, cookies, bases de pruebas, imágenes de contenedor y respaldos usan ORYX.

La revisión del 16 de octubre de 2026 (Costa Rica) completó tipos, análisis estático, compilación, 16 pruebas unitarias y de integridad, 74 comprobaciones de API y los 20 escenarios de navegador. En la primera ejecución, un escenario agotó el tiempo durante la carga inicial mientras otra compilación estaba en curso; los otros 19 pasaron y el escenario pendiente pasó al repetirlo con la compilación terminada.

La restauración cifrada de la base de pruebas comparó 46 tablas y 12 archivos; rechazó una clave incorrecta y contenido manipulado. También se abrió y verificó un respaldo anterior de 43 archivos. El respaldo nuevo de la instalación activa se restauró en otra base: 40 tablas idénticas, 43 archivos válidos y las 13 migraciones con sus sumas de verificación originales. Se conservaron credenciales e historiales inmutables.

La comprobación de la instalación activa confirmó 30 perros, 10 cuentas, 39 registros documentales, 369 razas y 18 plantillas, sin incidencias en sus siete controles internos. El trabajador y el respaldo cifrado permanecen operativos. El cambio de cookies requiere iniciar sesión de nuevo.

El enlace temporal actualizado pasó la prueba de acceso con administración y cliente: tres cookies ORYX presentes y seguras, API anónima bloqueada, fotografías cargadas, preventas accesibles y pantalla móvil sin desbordamiento.

## Portada pública y solicitudes · 18 de octubre de 2026

Tipos, análisis estático y compilación de producción completados. Pasaron 16 pruebas unitarias y de integridad, 82 comprobaciones de API y los 23 escenarios de navegador. Se ajustaron dos selectores antiguos de logo y el selector de campos obligatorios de la nueva prueba de aprobación; los cinco recorridos afectados pasaron al repetirse.

La cobertura nueva verifica catálogo anónimo y enlaces individuales, padres de camadas, camadas nacidas con cachorros publicados, retiro inmediato de fotos/publicaciones, ausencia de chips y notas privadas, validación de contacto/redes, consentimiento, límite de solicitudes, reintentos sin duplicados, avisos administrativos y aprobación exclusiva de cuentas CLIENT. El recorrido móvil envía consultas por correo sin WhatsApp, solicita una cuenta y completa su aprobación desde administración. El proxy temporal permite únicamente las rutas públicas autorizadas y sigue rechazando expedientes privados sin invitación.

El respaldo de la base aislada restauró 15 archivos y conservó solicitudes, configuración pública, auditoría e historiales financieros/inventario; rechazó contenido corrupto antes de modificar el destino. Antes de actualizar la instalación se creó otro respaldo cifrado, con 43 archivos verificados.

La instalación actualizada conservó sus 30 perros, 10 cuentas y 39 registros documentales, con 12 perros y 2 camadas/preventas publicados. Los siete controles internos devolvieron cero incidencias; administración y entrenador pudieron ingresar. El respaldo cifrado posterior restauró 42 tablas idénticas, 43 archivos y las 14 migraciones, manteniendo credenciales e historiales inmutables.

## Navegación pública y revisión · 22 de octubre de 2026

La portada aparece exclusivamente en `/`. `/disponibles` reúne perros y camadas con reservas; las fichas, progenitores, paginación y enlaces compartidos conservan su destino al recargar o navegar hacia atrás y adelante. Los enlaces antiguos redirigen a la ficha correspondiente antes de mostrar contenido. `/contacto` centraliza las consultas y solicitudes de cuenta; `/quienes-somos` describe la unidad y la atención en todo el país, sin atribuirle una dirección ni certificaciones.

Se retiraron los bloques repetidos de contacto y los contactos ficticios de las fichas públicas. Un botón flotante utiliza el número configurado por administración, actualiza sus datos al cambiar la configuración y se oculta mientras hay un formulario modal. El encabezado y el pie permiten recorrer las páginas y acceder a la cuenta. Las pestañas admiten teclado y las solicitudes conservan el contexto del perro o camada sin reaparecer en otra ficha.

Se comprobó la presentación en anchos de 320, 390 y 1440 píxeles. Las pruebas incluyen formularios públicos, reapertura de solicitudes, navegación directa, historial del navegador, estados de error, permisos de las tres cuentas, campos privados y controles del enlace compartido. La compilación y toda la batería de pruebas pasaron en GitHub Actions. Localmente también pasaron tipos y análisis estático; el intento de generar una nueva versión de producción se detuvo por un error de permisos de Windows (`EPERM`). La versión activa y los datos de uso no se reemplazaron. La activación local y la comprobación de un nuevo enlace temporal quedan pendientes de resolver el permiso de ejecución.

## Límites de la verificación

Las pruebas ejercitan los escenarios enumerados, no garantizan ausencia de errores en todos los escenarios posibles. Esta PC utiliza almacenamiento local y un enlace temporal. El despliegue permanente, Docker en el destino final, SMTP externo, dispositivos físicos, motor antivirus y servicios externos se validan al configurar esos entornos, según [ROADMAP](ROADMAP.md).
