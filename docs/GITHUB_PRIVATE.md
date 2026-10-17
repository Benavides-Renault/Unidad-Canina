# Repositorio GitHub

El repositorio seleccionado por el propietario es [Benavides-Renault/Unidad-Canina](https://github.com/Benavides-Renault/Unidad-Canina), creado como público. Contiene código, documentación y recursos ilustrativos; la configuración, datos y archivos de la instalación local quedan excluidos. El enlace web temporal se administra de forma independiente según [SHARING.md](SHARING.md). Antes de enviar, revisar que no estén incluidos `.env`, `.local`, datos, backups, archivos clínicos ni credenciales; `.gitignore` protege archivos nuevos pero no retira secretos ya rastreados.

```sh
git status --short
git ls-files
git diff --cached --check
```

Revisar los archivos rastreados y el diff. Si el directorio no es aún un repositorio independiente, inicializarlo desde `valkyr-manager` con `git init -b main`. No reutilizar accidentalmente un repositorio padre del Escritorio. Definir identidad Git propia. Una secuencia sugerida de commits significativos es:

1. `chore: initialize private VALKYR workspace and original branding`
2. `feat: add private authentication and canine records`
3. `feat: add health training calendar and durable reminders`
4. `test: verify permissions persistence and restore`
5. `docs: document deployment security and operating limits`

Hacer commits con los archivos correspondientes y verificar cada diff. No separar artificialmente un cambio si rompería la compilación. Para una sola entrega ya integrada, un commit inicial coherente es aceptable seguido de cambios funcionales independientes.

Para una nueva instalación privada, crear un repositorio **Private**, sin habilitar Pages ni publicar artefactos clínicos. En esta instalación se conserva la visibilidad del repositorio creado por el propietario. Para conectar una copia local:

```sh
git remote add origin URL_PRIVADA_DEL_REPOSITORIO
git push -u origin main
```

No pegar un token en la URL del remoto: usar gestor de credenciales o SSH autorizado. Invitar sólo colaboradores necesarios; exigir MFA de cuenta y revisión de cambios a `main`. Configurar protección de rama para los checks de CI. Las ramas nuevas de trabajo usan prefijo `codex/` por defecto.

CI ejecuta comprobaciones sobre datos sintéticos en una base de servicio aislada. Sus credenciales son efímeras de prueba, no una cuenta de VALKYR. Nunca copiar `.env` de producción a GitHub ni adjuntar dumps/archivos reales. Los reportes de pruebas pueden contener capturas: revisar contenido antes de compartir artefactos o cambiar visibilidad. No se activa ningún despliegue automático.

El workflow usa Node 24 y fija las acciones por SHA: [checkout 7.0.1](https://github.com/actions/checkout/releases/tag/v7.0.1), [setup-node 7.1.0](https://github.com/actions/setup-node/releases/tag/v7.1.0) y [upload-artifact 7.0.2](https://github.com/actions/upload-artifact/releases/tag/v7.0.2), verificadas en sus publicaciones oficiales el 15 de octubre de 2026. Actualizar esos hashes mediante revisión, sin desactivar controles de ramas o exponer secretos a código de contribuciones no confiables.
