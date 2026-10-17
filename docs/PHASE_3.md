# Fase 3 — Crianza y administración

Verificación inicial el 15 de octubre de 2026: 25 escenarios API (28 nodos TAP), 7 recorridos Playwright y controles TypeScript/lint aprobados. La última repetición API incluye coordinación entre apartados y asignaciones. Datos sintéticos sólo en bases `valkyr_test_*`.

## Flujos disponibles

- Perfiles reproductivos con procedencia/calidad del pedigrí, controles y celos; genealogía consultable a tres generaciones, detección de ciclos y aviso de incertidumbre. No calcula coeficientes genéticos ni recomienda cruces.
- Plan de cruce, fecha efectiva de monta, seguimiento y ventana de parto ingresada por un profesional. Registrar nacimiento cierra el plan y crea una camada con padres y recuentos.
- Cada cachorro es un expediente Dog desde el nacimiento: conserva UUID, código, microchip, peso, vacunas, fotos y documentos al incorporarse al directorio de la unidad. Los nacidos vivos limitan el número de cachorros identificados.
- Apartados por camada o cachorro, cupo validado, asignación posterior y prevención de reservas/entregas duplicadas. Cuenta por cobrar vinculada, anticipos como abonos, cierre con saldo cero, cancelación tras devolución; historial conservado.
- Cuentas por pagar/cobrar con categoría, centro de costo, referencias a perro/camada/contrato, CRC/USD y cambio fechado opcional. Resumen y CSV filtrados por emisión, dirección, contrato o perro; estado de cuenta PDF y comprobantes privados.
- Pagos y devoluciones inmutables. Importes exactos en Decimal; bloqueo transaccional para impedir sobreabonos; clave de operación para reintentos idempotentes.
- Productos, unidades, mínimos, lotes, costo por moneda y caducidad. Entradas, consumos y bajas inmutables; consumo asociado a perro/área, stock no negativo incluso con peticiones simultáneas. Los lotes vencidos requieren baja, no consumo.

## Límites registrados

Ampliación: árbol genealógico interactivo hasta tres generaciones, documentación por perro, catálogo de proveedores, conciliación manual contra comprobantes, flujo de caja por fechas y cierre mensual inmutable que impide pagos retroactivos. CRC y USD se conservan separados. No hay cálculo automático de tratamientos, certificados genéticos, integración fiscal ni conexión a bancos.

Los importes de una cuenta se conservan; para corregirla se devuelve lo abonado, se anula y se registra una nueva. No hay descuentos ni cambio automático entre monedas. La fecha de emisión gobierna los filtros del resumen; no es un libro contable fiscal ni un informe de flujo de caja por fecha de pago.

La capacidad de una camada descuenta apartados activos/entregados y cachorros no disponibles sin apartado vigente. Una baja se registra en el expediente. No se implementó modificación de recuentos de parto. El vencimiento de una reserva avisa y exige cierre explícito: no libera automáticamente un cachorro con anticipos.

Documentos clínicos/fotos se gestionan desde el expediente del perro. Los comprobantes pertenecen a la cuenta y no a un pago individual. Los controles reproductivos muestran los últimos 100 registros; datos anteriores permanecen en PostgreSQL. Notificaciones internas persistentes para cuentas y apartados; SMTP requiere configuración propia.
