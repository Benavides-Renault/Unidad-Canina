# Trabajo en ORYX K9

- La identidad vigente es **ORYX K9 · Unidad Canina**. Usa `oryx` para archivos, paquetes, variables propias y recursos nuevos. Conserva el logo original de `assets/branding/oryx-logo.png`.
- Antes de conservar o borrar un archivo, comprueba sus referencias. Retira duplicados y documentación superada; no borres datos privados, respaldos ni historiales de la instalación.
- No edites migraciones ya aplicadas. La lectura de respaldos anteriores y el reconocimiento de bases existentes se mantienen en los módulos de compatibilidad correspondientes.
- El propietario solicita mantener actualizado [el repositorio](https://github.com/Benavides-Renault/Unidad-Canina). Al terminar cambios autorizados, verifica el diff, ejecuta las pruebas pertinentes, publica el commit y comprueba GitHub Actions. No des por publicado un cambio que sólo existe localmente.
- No incluyas secretos, `.local`, datos, respaldos ni enlaces privados de invitación en Git. No fuerces la actualización de `main` ni reescribas el historial para una limpieza ordinaria.
- Sigue también `apps/web/AGENTS.md` al modificar la web. Las pruebas de sistema deben usar una base aislada; nunca reinicies los datos de uso como parte de una comprobación.
