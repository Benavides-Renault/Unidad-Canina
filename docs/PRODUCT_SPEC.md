# ORYX K9 · Unidad Canina

Especificación vigente de la portada pública y la aplicación privada. Sustituye el prompt inicial de construcción, que describía una identidad y unos permisos anteriores.

## Identidad y acceso

La marca es **ORYX K9 · Unidad Canina**. El archivo maestro es `assets/branding/oryx-logo.png`; la web utiliza su copia exacta en `apps/web/public/oryx-logo.png`. El catálogo, las consultas y las solicitudes de cuenta son públicos. La creación de cuentas requiere revisión y aprobación de administración. Las cuentas acceden mediante usuario y contraseña.

| Cuenta         | Acceso                                                                                                                             |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Administración | Todos los módulos; crea cuentas y asigna perros; administra registros y publicaciones.                                             |
| Entrenador     | Consulta sus perros asignados y agrega registros de entrenamiento y salud; no modifica ni elimina historiales.                     |
| Cliente        | Persona o entidad, incluida una municipalidad. Consulta sus perros y su historial completo, además de venta y preventa publicadas. |

Propietario, custodio y entrenador asignado son relaciones independientes. La custodia no concede acceso al portal del propietario. La API aplica los permisos también sobre archivos, informes y relaciones.

## Funciones

- Expedientes con razas del catálogo o personalizadas, código, microchip y pedigrí verificados contra duplicados; documentación, fotos, movimientos y pesos.
- Entrenamientos por disciplina, objetivos, evaluaciones y certificaciones. Registros médicos, vacunas, correcciones versionadas y comprobantes privados.
- Calendario, recordatorios persistentes y preferencias de notificaciones.
- Venta y preventa administradas, información autorizada, precios y contacto. Venta, entrenamiento y disponibilidad para cruza pueden coexistir.
- Portada pública y enlaces individuales para compartir perros y camadas sin cuenta. Sólo muestra publicaciones comerciales y resúmenes autorizados; los expedientes médicos completos, propietarios y documentos permanecen privados. Una camada nacida se muestra mientras conserve cachorros publicados disponibles.
- Consultas de contacto y compra, solicitudes de cuenta, bandeja administrativa, seguimiento y avisos internos. Aprobar una solicitud crea exclusivamente una cuenta de cliente; administración vincula su propietario. WhatsApp abre un chat con mensaje preparado, sin envío automático. Teléfono, correo y redes se configuran desde Solicitudes.
- Cruces entre reproductores habilitados, fecha de monta, nacimiento y entrega previstos, actualización del nacimiento real, camadas y cachorros.
- Instituciones, contactos, contratos, renovaciones, asignaciones, servicios y documentos.
- Apartados, entregas, proveedores, cuentas, abonos, devoluciones, conciliación y cierres. Inventario por producto, lote y movimiento.
- Plantillas de documentos, ayudas en formularios, auditoría interna y monitor de la instalación.

## Integridad y operación

Los historiales financieros, movimientos y correcciones conservan trazabilidad. Los datos privados no se almacenan en caché del navegador. Los respaldos incluyen base y archivos, cifrado y restauración aislada.

La instalación actual está en una PC Windows y puede compartirse mediante un enlace temporal. El repositorio contiene código y documentación; los datos, secretos y respaldos permanecen fuera de Git. Los límites de despliegue se detallan en [ROADMAP](ROADMAP.md).

Los documentos clínicos son registros internos y no sustituyen certificaciones profesionales. No se implementa facturación fiscal ni conversión automática de monedas.
