# Accesos y recorrido de prueba

Abrir [ORYX K9 local](http://localhost:3000). **Todas las contraseñas son `1234`.**

| Usuario             | Acceso                                   |
| ------------------- | ---------------------------------------- |
| `admin`             | Administración completa                  |
| `coordinacion`      | Administración completa                  |
| `ana.entrenadora`   | Perros asignados a Ana                   |
| `diego.entrenador`  | Perros asignados a Diego                 |
| `lucia.entrenadora` | Perros asignados a Lucía                 |
| `sofia.cliente`     | Perros de Sofía, incluido Astra          |
| `carlos.cliente`    | Perros de Carlos                         |
| `muni.valleverde`   | Perros de Municipalidad Valle Verde      |
| `muni.valleverde2`  | Segundo acceso de la misma municipalidad |
| `muni.montelago`    | Perros de Municipalidad Monte Lago       |

El contacto de todas las ventas y preventas es **María Vargas · +123456789**. Es un ejemplo, no un destinatario verificado; no se envían mensajes automáticamente. Los datos son ficticios y las 30 fotos son ilustrativas de Pexels. Los autores, fuentes y licencia están en `assets/demo/sources.json` y `assets/demo/README.md`. Los carteles de demostración se omitieron de la interfaz a petición del usuario.

`DEMO_MODE=true` permite cuatro caracteres. Fuera de ese modo se exigen doce y el administrador se crea mediante el asistente privado; no existe acceso universal de arranque.

## Recorrido

Hay 18 adultos y 12 cachorros en tres camadas, 12 publicaciones de venta y dos cruces en preventa. Incluye 72 sesiones, 12 planes con 24 objetivos y 72 evaluaciones, vacunas, pesajes, citas, apartados, contratos/servicios, cuentas/pagos e inventario con seis productos.

La ampliación incorpora tres plantillas, tres proveedores, controles clínicos con revisiones y comprobantes en Thor, Rex y Maya, certificados desde plantilla y un cierre de septiembre de 2026 conciliado.

1. `admin`: recorrer Inicio, Nuestra unidad, Crianza, Apartados, Finanzas e Inventario.
2. Thor → Salud/Entrenamiento: consultar comprobantes, correcciones, objetivos y certificados.
3. Configuración: plantillas, MFA, avisos y estado del respaldo cifrado.
4. Finanzas → Proveedores, caja y cierres: consultar septiembre de 2026.
5. Calendario: elegir vista/filtro; persisten para esa cuenta.
6. `ana.entrenadora`: sólo asignados y opciones de alta.
7. `sofia.cliente`: historial de Rex/Astra, galería, padres, precio y contacto.
8. Comparar los dos accesos de Valle Verde: comparten sus perros.

## Conservación

La instalación anterior y sus respaldos se conservan fuera del repositorio. La normalización inicial de los datos sintéticos ya se completó; no es una operación necesaria para iniciar ni actualizar la aplicación.

`INICIAR_ORYX_K9.cmd` inicia la versión activa. Los respaldos diarios funcionan mientras ORYX K9 permanece abierto. Las restauraciones de comprobación se hacen en otra base.
