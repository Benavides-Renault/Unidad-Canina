# Repositorio y publicación

El repositorio público autorizado es [Benavides-Renault/Unidad-Canina](https://github.com/Benavides-Renault/Unidad-Canina). Contiene el código de ORYX K9, documentación y recursos ilustrativos. Los datos, archivos privados, secretos, respaldos y enlaces de invitación quedan fuera de Git.

## Actualizar el repositorio

Cada cambio funcional o limpieza se verifica, se guarda en un commit y se publica en este repositorio. Las ramas de trabajo usan el prefijo `codex/`. Antes de publicar, revisar:

```sh
git status --short
git diff --check
git diff --cached --stat
npm run typecheck
npm run lint
npm test
```

Ejecutar las pruebas de sistema cuando cambien permisos, formularios, persistencia o acceso. Confirmar que el commit publicado coincide con el código probado y que la ejecución de GitHub Actions termina correctamente. No forzar la actualización de `main` ni reescribir el historial para retirar archivos obsoletos; una eliminación normal conserva la posibilidad de recuperación.

Las credenciales se gestionan mediante el gestor de Git, SSH o la conexión autorizada de GitHub. No escribir tokens en la URL del remoto ni en archivos del proyecto. La visibilidad actual del repositorio no se cambia durante una actualización de código.

## Verificación y despliegue

GitHub Actions utiliza Node 24 y una base PostgreSQL efímera. Ejecuta instalación de dependencias, migraciones, tipos, análisis estático, pruebas unitarias, compilación y pruebas de API/navegador. Las acciones están fijadas por SHA en `.github/workflows/ci.yml`.

Publicar código no reinicia la instalación local ni crea un alojamiento permanente. Para actualizar la PC, seguir [DEPLOY_LOCAL](DEPLOY_LOCAL.md), respaldar antes de activar y comprobar la versión en ejecución. El enlace temporal se administra según [SHARING](SHARING.md).
