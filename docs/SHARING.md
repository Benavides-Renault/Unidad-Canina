# Compartir ORYX K9 desde esta PC

La aplicación sigue alojada en esta PC. Cloudflare Quick Tunnel ofrece una dirección HTTPS temporal sin abrir puertos entrantes del router. El enlace cambia al iniciar una sesión nueva y funciona mientras la PC, ORYX K9 y el túnel estén activos. Caduca como máximo a las 24 horas. [Documentación de Cloudflare](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).

1. Abrir `INICIAR_ORYX_K9.cmd` si la aplicación está detenida.
2. Abrir `COMPARTIR_ORYX_K9.cmd` y mantener su ventana abierta.
3. Copiar el campo `shareUrl` de `.local/share-runtime.json`, incluido `#compartir=…`, y enviarlo únicamente a la persona invitada.
4. La persona abre el enlace y usa una cuenta de la aplicación. Las cuentas de ejemplo están en [DEMO_ACCESOS.md](DEMO_ACCESOS.md). Para mostrar toda la administración: usuario `admin`, contraseña `1234`; para mostrar la vista de cliente: `sofia.cliente`, contraseña `1234`.
5. Al terminar, abrir `DETENER_ENLACE_ORYX_K9.cmd`. La aplicación local continúa funcionando.

El enlace actúa como invitación: cualquiera que lo reciba completo puede abrir el inicio de sesión. Su clave aleatoria tiene 256 bits, se intercambia por una cookie segura y se retira de la barra de dirección. El dominio sin esa clave no permite consultar la API. No guardar la invitación en GitHub. Para revocarla, detener el enlace y generar otro.

La sesión compartida usa los mismos datos de prueba que la aplicación local. Los cambios realizados desde una cuenta administradora se reflejan aquí. El iniciador rechaza instalaciones sin `DEMO_MODE=true`; las contraseñas de cuatro caracteres siguen siendo únicamente para este entorno de prueba.

El proxy escucha exclusivamente en `127.0.0.1:3002`, valida dominio y origen antes de reenviar, conserva la protección CSRF, marca las cookies como Secure y evita almacenar respuestas. No expone PostgreSQL ni directorios de archivos. El ejecutable de Cloudflare se descarga de su repositorio oficial y se comprueba contra el SHA-256 de la versión fijada.

Para alojamiento permanente, usar el procedimiento de [DEPLOY_SERVER.md](DEPLOY_SERVER.md) con un proveedor, dominio y credenciales definitivas.
