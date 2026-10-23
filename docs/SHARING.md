# Compartir ORYX K9 desde esta PC

La página principal es pública y presenta ORYX K9. El encabezado lleva a **Perros disponibles**, **Quiénes somos**, **Contacto** e **Iniciar sesión**. El catálogo `/disponibles` reúne **Perros en venta** y **Camadas y reservas**; sus fichas se abren sin repetir la presentación de la portada. Para entrar al panel se utiliza usuario y contraseña, sin invitaciones ni enlaces con claves.

1. Abrir `INICIAR_ORYX_K9.cmd` si la aplicación está detenida.
2. Abrir `COMPARTIR_ORYX_K9.cmd` y mantener su ventana abierta.
3. Copiar `publicUrl` de `.local/share-runtime.json` y compartirlo. Abre la portada `/`.
4. **Perros disponibles** y **Camadas** seleccionan la sección correspondiente. Cada ficha permite copiar su enlace.
5. **Iniciar sesión** abre `/acceso`; después de autenticarse, la cuenta entra a `/panel` según su rol.
6. Al terminar, abrir `DETENER_ENLACE_ORYX_K9.cmd`. La aplicación local continúa funcionando.

El pie de página reúne navegación y acceso a la cuenta. `/contacto` centraliza teléfono, correo, redes y solicitudes; WhatsApp está disponible en el botón flotante del sitio y utiliza el número configurado en **Solicitudes → Contacto y redes de la portada**. Los campos sin configurar se ocultan. `/quienes-somos` presenta el proyecto y la atención en todo el país sin publicar una ubicación. Los enlaces antiguos `/catalogo` y `/?tipo=…&id=…` redirigen al catálogo y conservan la ficha seleccionada.

Los campos `publicUrl` y `shareUrl` contienen la misma portada; `loginUrl` apunta a `/acceso`. Las cuentas de prueba se consultan en [DEMO_ACCESOS.md](DEMO_ACCESOS.md). Los datos de la instalación y los archivos `.local` no se publican en GitHub.

Cloudflare Quick Tunnel ofrece una dirección HTTPS temporal sin abrir puertos entrantes del router. El enlace cambia al iniciar una sesión nueva y funciona mientras la PC, ORYX K9 y el túnel estén activos. Caduca como máximo a las 24 horas. [Documentación de Cloudflare](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).

El proxy escucha exclusivamente en `127.0.0.1:3002`, admite las páginas y rutas API de la aplicación, valida dominio y origen, marca las cookies como Secure y evita almacenar respuestas. La API comprueba las sesiones, los roles y CSRF antes de entregar datos o aceptar cambios privados. Sin iniciar sesión no se pueden consultar expedientes ni solicitudes administrativas. No se expone PostgreSQL ni directorios de archivos. El ejecutable de Cloudflare se comprueba contra el SHA-256 de la versión fijada.

La sesión compartida usa los mismos datos de prueba que la aplicación local. Los cambios de administración se reflejan aquí. El iniciador rechaza instalaciones sin `DEMO_MODE=true`; las contraseñas de cuatro caracteres siguen siendo únicamente para este entorno de prueba.

El túnel usa selección automática de protocolo: prueba QUIC y puede recurrir a HTTP/2 si UDP no está disponible, según los [parámetros oficiales de Cloudflare](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/run-parameters/#protocol). La disponibilidad del enlace depende también de la conexión a Internet y del servicio temporal.

Para alojamiento permanente, usar [DEPLOY_SERVER.md](DEPLOY_SERVER.md) con un proveedor, dominio y credenciales definitivas.
