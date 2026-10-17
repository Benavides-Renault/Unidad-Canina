# Roles y alcance por perro

Sólo existen ADMIN (Administrador), TRAINER (Entrenador) y CLIENT (Cliente). Una persona y una municipalidad usan el mismo tipo de cuenta cliente. Sólo administración crea o modifica cuentas; el ingreso utiliza usuario y contraseña, sin registro abierto.

| Operación                                                                       | Administrador | Entrenador                    | Cliente                      |
| ------------------------------------------------------------------------------- | ------------- | ----------------------------- | ---------------------------- |
| Administrar usuarios, propietarios, custodia y asignaciones                     | Sí            | No                            | No                           |
| Crear, modificar o archivar perros                                              | Sí            | No                            | No                           |
| Añadir entrenamiento, registros médicos, vacunas, pesos y comprobantes clínicos | Todos         | Sólo perros asignados         | No                           |
| Corregir o retirar información con las acciones disponibles                     | Sí            | No                            | No                           |
| Consultar historial médico y entrenamiento                                      | Todos         | Sólo asignados                | Sólo propios, completo       |
| Consultar documentos privados                                                   | Todos         | Clínicos y fotos de asignados | Documentos de perros propios |
| Contratos, servicios, crianza, apartados, finanzas, inventario y auditoría      | Sí            | No                            | No                           |
| Configurar y publicar venta o preventa                                          | Sí            | No                            | No                           |
| Consultar galería publicada                                                     | Sí            | No                            | Sí                           |

## Propiedad, custodia y asignación

Party identifica a VALKYR, una persona, municipalidad u organización. Dog.ownerPartyId define al propietario; Dog.custodianPartyId identifica a quien tiene físicamente al perro. El cliente ve perros cuyo propietario coincide con User.partyId. La custodia no concede acceso al portal. Varias cuentas de una municipalidad pueden vincularse a su misma entidad. Dog.assignedTrainerId determina el único entrenador autorizado; no depende del propietario ni de los contratos.

Cada consulta, descarga y alta comprueba su alcance en el servidor. Un ID ajeno devuelve 404. Los módulos administrativos devuelven 403 al entrenador y al cliente. Cambiar propietario o asignación aplica en las siguientes peticiones; cambiar entidad de la cuenta, contraseña, rol o deshabilitarla revoca sus sesiones. Deshabilitar o cambiar de rol a un entrenador retira sus asignaciones.

## Galería

La venta requiere categoría FOR_SALE, publicación expresa, disponibilidad AVAILABLE, precio positivo y contacto. Los perros vendidos, retirados, fallecidos o archivados no se muestran. La preventa requiere plan publicado vigente y ambos padres adultos en FOR_BREEDING y disponibles. Sólo administración crea cruces. Un padre disponible para cruza no aparece por sí solo como perro en venta.

El interesado recibe identidad básica y textos públicos seleccionados por administración: información general, logros, pedigrí, entrenamiento, funcionalidad y resumen médico. Nunca recibe el historial clínico completo, notas internas, propietario, cuentas ni documentos privados del perro en venta. Sólo la fotografía principal de una publicación vigente tiene acceso desde galería. El cliente propietario sí puede leer todo el historial de su perro.

## Migración

La migración 007 conserva cuentas, contraseñas e historiales. SUPERADMIN/ADMIN pasan a ADMIN; TRAINER/VET a TRAINER; FINANCE/VIEWER a CLIENT. Los propietarios escritos anteriormente se convierten en entidades, sin vincular clientes por semejanza de nombre. Administración debe confirmar esa vinculación y asignar entrenadores. Todos los perros y cruces quedan inicialmente sin publicar. Los nombres de roles anteriores en informes históricos describen versiones anteriores.
