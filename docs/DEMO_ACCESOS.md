# Datos sintéticos de verificación

La instalación operativa de la empresa ya no contiene el conjunto de demostración ni sus cuentas. Conserva el administrador inicial, 369 razas, 18 plantillas, la entidad técnica ORYX K9 y el contacto institucional +506 7032 7517 para teléfono y WhatsApp. Los accesos y el alta de datos se describen en [USER_GUIDE.md](USER_GUIDE.md); el montaje de una base nueva, en [DEPLOY_SERVER.md](DEPLOY_SERVER.md).

Los scripts `demo-*`, fotografías de `assets/demo` y fixtures de pruebas se conservan para verificación aislada. No forman parte de la carga inicial normal, no deben ejecutarse sobre la instalación de empresa y no acreditan propiedad, raza, pedigrí ni disponibilidad de perros reales. Las fuentes y licencias de las fotografías se conservan en [el registro de recursos](../assets/demo/README.md).

`demo-prepare.mjs --create-demo` crea deliberadamente una base local nueva. Los demás scripts de demostración tienen sus propias opciones y comprobaciones de destino. Ninguno debe añadirse al arranque, a las migraciones ni al despliegue del servidor. `DEMO_MODE=true` corresponde exclusivamente a estos entornos sintéticos; la configuración de empresa usa `DEMO_MODE=false`.

Los reportes de ejecuciones anteriores conservan sus fechas, conteos y resultados. Son evidencia histórica de pruebas realizadas con datos ficticios y no describen los registros actuales de la empresa. Las nuevas pruebas de sistema también deben utilizar una base aislada.
