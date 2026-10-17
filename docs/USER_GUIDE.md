# Uso de VALKYR Manager

Los datos de ejemplo y sus diez cuentas están en [DEMO_ACCESOS.md](DEMO_ACCESOS.md). Todas las contraseñas actuales son `1234`.

## Planes, certificaciones y calendario

En el expediente del perro → Entrenamiento, o en Seguimiento médico, **Nuevo plan** permite definir fechas, disciplina y hasta 12 objetivos. Cada objetivo tiene un criterio y una meta sobre 100. **Evaluar** agrega un resultado fechado con observaciones; el historial conserva todas las evaluaciones. Los entrenadores pueden añadirlas sólo a sus asignados. Administración usa **Estado y plazo** para completar/reabrir o cambiar el vencimiento; no puede completar el plan hasta alcanzar todas las metas en las últimas evaluaciones.

**Registrar certificación** guarda emisor, referencia y vigencia. Los clientes ven estos registros en sus propios perros; no se publican automáticamente en la galería. Administración puede archivarlos. Los vencimientos generan avisos internos administrativos.

**Calendario → Tipo de evento** filtra citas, vacunas, objetivos, certificaciones, cruzas, contratos, reservas y cobros/pagos. Citas usan hora de Costa Rica; vencimientos ocupan todo el día. **Configuración → Estado de la instalación** muestra trabajador y última copia diaria.

## Primer acceso

En esta PC, abrir **INICIAR_VALKYR.cmd**, entrar en `http://localhost:3000` e iniciar sesión con **admin / 1234**. En una instalación nueva, bootstrap solicita el usuario y contraseña propios. El correo es opcional y no hay registro público. En Configuración, los administradores pueden activar TOTP y guardar los ocho códigos de recuperación mostrados una sola vez. Usar uno revoca las otras sesiones; renovar los códigos invalida los anteriores.

Para añadir socios, abrir **Administración → Usuarios → Crear usuario**. Completar nombre, usuario, contraseña y rol. Esta instalación de prueba permite `1234`; fuera del modo de prueba se exigen doce caracteres. El correo es opcional. Elige **Administrador**, **Entrenador** o **Cliente**. Al crear un cliente, vincula su persona/municipalidad existente o crea una. Varias cuentas pueden compartir municipalidad. El buscador localiza cualquier cuenta; después del alta se muestra la cuenta creada.

En el lápiz **Editar usuario**, se pueden cambiar nombre, usuario, correo, rol y estado. **Nueva contraseña (opcional)** permite recuperar el acceso de un socio sin correo; vacía conserva la clave actual. Cambiarla cierra sus sesiones y anula los enlaces de recuperación anteriores. Si modificas tu propia contraseña, volverás al inicio de sesión. Cambia la clave de prueba de `admin` desde aquí antes de usar datos reales.

La recuperación automática pide el usuario y envía un enlace temporal si la cuenta tiene correo y SMTP está configurado; en desarrollo los mensajes se consultan en Mailpit. Sin correo asociado, solicitar una nueva contraseña al administrador.

La migración conserva las cuentas anteriores y les asigna `usuario_` seguido de su UUID sin guiones. El superadministrador puede ver y modificar estos nombres desde Usuarios; no cambian las contraseñas ni las relaciones de los registros existentes.

## Expediente canino

En **Perros**, buscar por nombre/código/raza/microchip y filtrar según los controles disponibles. Crear un expediente con nombre, sexo y raza; completar identificación, nacimiento, ubicación y responsable cuando existan datos verificables. El código se genera si no se introduce. El microchip es único: duplicarlo produce un error controlado.

Mantener separados situación administrativa, estado de trabajo, estado reproductivo y disponibilidad. Un perro puede ser operativo y tener planificación reproductiva. El sistema aplica restricciones básicas a estados incompatibles; revisar siempre la información antes de guardar. El archivado conserva el historial y retira el expediente de listados activos.

La ficha concentra información y acciones por rol. Registrar movimientos para conservar ubicación histórica; un movimiento antiguo no debería reemplazar una ubicación posterior. Pesos y vacunas son acciones clínicas autorizadas. Cerrar/reabrir sesión no elimina datos: se guardan en PostgreSQL, no en el navegador.

## Fotos y documentos

Adjuntar PNG/JPEG como fotografía o PDF/JPEG/PNG como documento, máximo 10 MB. La carga de una foto la establece como principal. Los comprobantes clínicos los consultan administración, el entrenador asignado y el cliente propietario. El cliente interesado en comprar sólo ve la foto principal publicada y el resumen médico autorizado.

Una descarga exige sesión y permisos. La URL no es un enlace público para compartir con clientes. El archivado de un documento conserva sus bytes para retención; la eliminación definitiva requiere un procedimiento de administración aún no automatizado. Los contratos se adjuntan en su módulo y los comprobantes financieros en su cuenta. No subir ejecutables ni archivos de origen desconocido.

## Salud y carné

Registrar producto, aplicación y próxima dosis, además de fabricante/lote/profesional y observaciones cuando corresponda. No inventar datos que no están en el comprobante. La próxima dosis debe ser posterior a aplicación. El carné PDF reúne identidad y vacunas trazables; es un **registro interno**, no certificación oficial veterinaria. La plataforma no prescribe tratamientos ni calcula dosis.

Se programan avisos persistentes para vencimientos según las reglas implementadas. El worker debe permanecer activo; sin correo configurado puede haber aviso interno sin correo externo. Los administradores deben revisar errores de entrega. En **Seguimiento médico** se registran diagnóstico, estado clínico, alergias, medicación y controles. Una corrección administrativa exige un motivo y conserva la versión anterior; **Versiones** permite consultarla. **Vincular comprobante** asocia un archivo al registro concreto.

## Citas y entrenamiento

Crear una cita para el perro con fecha/hora de Costa Rica, título, lugar y profesional. Ajustar antelación del recordatorio y marcar realizada/cancelada cuando corresponda. El aviso inicial pertenece al creador de la cita. El calendario conserva la vista y el filtro de cada cuenta. En **Configuración**, las preferencias permiten activar correo y notificaciones del navegador cuando sus servicios estén configurados; Web Push requiere permiso en cada navegador.

Añadir sesiones con objetivo, disciplina, duración y observaciones. Los planes permiten criterios, metas y evaluaciones acumulativas. **Vincular comprobante** adjunta documentos a vacunas, registros médicos, sesiones, evaluaciones y certificaciones; MP4 sólo está permitido en sesiones/evaluaciones. Los certificados pueden usar una plantilla y descargarse en PDF.

## Contratos y servicios

En **Contratos → Instituciones**, crear la institución y sus contactos. Volver a Contratos y registrar número, fechas, moneda, importe, responsable y cláusulas. Una modificación conserva una versión; si otra persona editó primero, recargar antes de reintentar. Adjuntar el contrato firmado en PDF o imagen desde su ficha.

Activar el contrato y asignar perros disponibles con sus fechas y manejador. Un solapamiento se bloquea salvo excepción administrativa con motivo. Retirar una asignación conserva su historial. Los perros apartados, vendidos, fallecidos, retirados o no disponibles no se pueden asignar; tampoco se puede apartar un perro con servicio asignado vigente.

En **Operaciones**, registrar los servicios realizados. El entrenador opera sobre sus asignaciones. Separar el resumen para cliente de las notas internas: el PDF del contrato sólo incluye información pública del servicio y no exporta importes, cláusulas ni notas internas.

Los contactos institucionales se pueden editar. **Renovar** crea un contrato enlazado con nuevas fechas y conserva el anterior; revisar sus condiciones y asignaciones. Las plantillas de **Configuración** permiten reutilizar cláusulas y certificados de entrenamiento o crianza. El certificado conserva el contenido de la plantilla usado al emitirlo.

## Crianza y camadas

En **Crianza**, registrar perfiles con progenitores y origen/calidad del pedigrí. Los antecedentes, celos y revisiones conservan fecha y profesional. La genealogía muestra relaciones conocidas hasta tres generaciones; información incompleta no equivale a ausencia de parentesco.

Crear un plan de cruce y registrar la monta cuando ocurra. La ventana estimada de parto se introduce manualmente junto con método y profesional; no es un diagnóstico automático. Al nacer, registrar la camada, nacidos vivos y fallecidos. Identificar a cada cachorro en su camada. **Promover a expediente** lo incorpora al listado general conservando el mismo ID, vacunas y demás historia.

## Apartados, cuentas y pagos

En **Apartados**, seleccionar camada y, si ya está identificado, cachorro; completar cliente, contacto, condiciones, fechas, importe total y moneda. También se admite apartar un cupo y asignarle el cachorro después. No se puede reservar dos veces el mismo cachorro ni superar los cupos disponibles. Cada apartado crea una cuenta por cobrar.

Abrir su cuenta para registrar abonos con fecha, método y referencia. El saldo se calcula con decimales exactos. Para cancelar un apartado con dinero recibido, registrar primero el reintegro; entregar exige cachorro asignado y saldo cero. La entrega lo marca vendido, sin borrar su historia. El vencimiento avisa y requiere cierre administrativo; no cancela automáticamente un apartado pagado.

En **Finanzas**, crear cuentas por pagar o cobrar, categoría, centro de costo y vínculos opcionales a perro, camada o contrato. CRC y USD se muestran por separado. El tipo de cambio y su fecha son referencia, sin conversión automática. Los pagos no se editan ni borran: corregir con un reintegro trazable; cancelar una cuenta requiere saldo de pagos neto cero. El importe original se corrige cancelando y creando una nueva cuenta. Adjuntar comprobantes en la cuenta y descargar CSV o reporte PDF interno cuando sea necesario. Estos documentos no son facturas fiscales.

En **Proveedores, caja y cierres**, registrar proveedores y consultar el flujo por fechas. Conciliar cada pago contra su comprobante, indicando referencia e importe verificado. Sólo se puede cerrar un mes terminado cuando todos sus pagos estén conciliados. El cierre conserva los totales y bloquea pagos retroactivos de ese mes; revisar antes de confirmar. Las cuentas permiten vincular al proveedor correspondiente.

## Inventario y estado del sistema

En **Inventario**, crear producto con unidad y mínimo; después crear lote con costo, moneda y caducidad. El lote empieza en cero: registrar una entrada para cargar existencias. Las salidas indican motivo, perro o área; el sistema impide stock negativo y consumo de lotes vencidos. Usar una baja para descartar existencias vencidas. Los movimientos conservan su historial y los reintentos de una misma operación no duplican cantidades.

En **Configuración**, los administradores pueden actualizar el estado del sistema: última actividad del trabajador, recordatorios pendientes/fallidos, almacenamiento y configuración de correo. Un trabajador detenido requiere reiniciar la aplicación o revisar sus registros; este panel no envía alertas cuando la PC está apagada.

## Exportaciones y acceso móvil

Exportar CSV desde el listado o PDF desde la ficha según permisos. Las exportaciones pasan a estar bajo custodia de quien las descarga; guardarlas en ubicación autorizada. La bitácora registra exportaciones y descargas sensibles.

La interfaz es adaptable; en pantallas pequeñas usar menú móvil. Para instalar como PWA, abrir en navegador compatible y elegir su opción de instalación cuando se ofrezca. En dispositivos de LAN se requiere HTTPS confiable. La aplicación necesita conexión para leer/guardar expedientes: no hay modo offline de datos ni sincronización.

Si una operación falla, leer el mensaje y conservar cambios antes de recargar. `401` requiere sesión; `403` indica permiso insuficiente; un error de microchip/código exige corregir el dato. No compartir capturas con datos personales en canales públicos. Contactar al administrador con la acción y hora del error, sin contraseña, código TOTP o enlaces de recuperación.

## Propietario, responsable y entrenador

En **Personas y entidades** registra propietarios y responsables que aún no tengan cuenta. En **Nuestra unidad → Nuevo perro / Editar expediente**, selecciona **Propietario registrado**, **Quién tiene el perro** y, opcionalmente, **Entrenador asignado**. Son datos independientes: VALKYR puede entrenar un perro de un cliente mientras otro responsable lo custodia. **Ubicaciones → Registrar movimiento** cambia el responsable físico y conserva el historial, sin cambiar al propietario.

## Espacios de cliente y entrenador

El cliente entra directamente a **Mis perros**. Puede abrir cada perro propio, leer todo su historial médico, vacunas, pesos y entrenamientos, y descargar sus documentos. La segunda pestaña contiene la galería de venta y preventa. El entrenador entra a **Mis perros asignados** y puede añadir entrenamientos, registros médicos, vacunas, pesos y comprobantes clínicos; no puede editar ni retirar entradas. Administración dispone también de **Seguimiento médico** para añadir, corregir o archivar registros médicos.

## Publicar venta y preventa

En **Venta y preventa → Configurar publicación**, el administrador elige **En venta**, precio, moneda, contacto y los textos que podrán ver interesados. Activa **Publicar este perro en venta**. Dejar la publicación desactivada mantiene el perro fuera de la galería. **Vista de clientes** permite comprobar el resultado. El historial médico completo no se publica: usa **Salud que pueden ver interesados** para elegir el resumen.

Para una futura camada, clasifica primero a ambos progenitores como **Disponible para cruza**, conservando su disponibilidad. Después crea el plan desde **Crianza**, completa título público, precio por cachorro y contacto, y activa la publicación de preventa. Los clientes podrán abrir el cruce y consultar cada padre. Al cerrar el plan, retirar la publicación o dejar de estar disponibles sus padres, deja de mostrarse.

Los apartados se administran en **Apartados**. Al entregar un cachorro pagado, selecciona el propietario cliente; la entrega lo registra como propietario y custodio, retira la asignación del entrenador y la publicación, y muestra el perro con su historial en el portal de ese cliente. El contacto de la galería permite consultar a VALKYR; no confirma reservas automáticamente.
