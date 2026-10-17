// Presentation content for the synthetic local dataset. Provenance stays in docs/DEMO_ACCESOS.md.
export const salesContact = 'María Vargas · +123456789';
const replacements = [
  ['Administrador DEMO', 'Administración ORYX'],
  ['Ana · entrenadora DEMO', 'Ana Rodríguez'],
  ['Diego · entrenador DEMO', 'Diego Mora'],
  ['Lucía · entrenadora DEMO', 'Lucía Campos'],
  ['Sofía · cliente DEMO', 'Sofía Solano'],
  ['Carlos · cliente DEMO', 'Carlos Méndez'],
  ['Contacto de demostración: consultar a administración', salesContact],
  ['Contacto DEMO: consultar a administración', salesContact],
  ['Contacto ficticio DEMO', salesContact],
  ['Contacto de demostración', 'María Vargas'],
  [
    'Expediente ficticio de demostración. No corresponde a un animal real.',
    'Seguimiento integral de salud, entrenamiento y custodia.',
  ],
  [
    'compañero de demostración para explorar el sistema.',
    'perro activo, sociable y con seguimiento individual.',
  ],
  [
    'Ejemplo: evaluación interna de obediencia completada. Datos ficticios.',
    'Evaluación interna de obediencia completada.',
  ],
  [
    'Trabajo de obediencia y socialización registrado como demostración.',
    'Obediencia básica, permanencia y socialización en distintos entornos.',
  ],
  [
    'Compañía activa y entrenamiento deportivo. Aptitudes ficticias para pruebas.',
    'Compañía activa y entrenamiento deportivo.',
  ],
  [
    'Línea de demostración; no representa un pedigrí oficial.',
    'Ascendencia y filiación disponibles en el expediente.',
  ],
  [
    'Sesión ficticia de 10 intentos para comprobar evolución.',
    'Diez repeticiones de llamada, permanencia y marcha junto al guía.',
  ],
  [
    'Registro de prueba; no describe un entrenamiento real.',
    'Buen enfoque y respuesta al refuerzo durante la sesión.',
  ],
  ['Vacunación de demostración', 'Vacuna polivalente'],
  ['Profesional ficticio DEMO', 'Dra. Valeria Rojas'],
  [
    'Observación ficticia para probar el historial privado. No representa una evaluación clínica real.',
    'Control de bienestar, condición corporal y evolución del perro.',
  ],
  [
    'Acreditación ficticia para probar vencimientos; no es un certificado oficial.',
    'Evaluación interna completada con seguimiento programado.',
  ],
  ['Filiación ficticia de demostración.', 'Filiación registrada en el expediente.'],
  ['Resumen de demostración autorizado.', 'Controles de bienestar y vacunación registrados.'],
  [
    'Preventa ficticia: permite explorar los padres y consultar condiciones.',
    'Próxima camada con seguimiento desde el nacimiento. Consulta la información de los padres y las condiciones de reserva.',
  ],
  [
    'Apartado de demostración sin efectos comerciales.',
    'Reserva sujeta a disponibilidad y confirmación de la administración.',
  ],
  [
    'Entrega ficticia para probar transferencia de propiedad.',
    'Entrega al propietario con expediente actualizado.',
  ],
  ['Cancelación ficticia para comprobar liberación de cupos.', 'Cancelación solicitada por el cliente.'],
  [
    'Registro ficticio de seguimiento para comprobar propiedad e historial.',
    'Seguimiento del crecimiento, socialización y adaptación al entorno.',
  ],
  ['Nacimiento ficticio para pruebas.', 'Nacimiento registrado; control individual de cada cachorro.'],
  [
    'Condiciones ficticias sin valor contractual.',
    'Servicio de entrenamiento, seguimiento y acompañamiento conforme al calendario acordado.',
  ],
  ['Institución ficticia para pruebas.', 'Contacto institucional y coordinación de servicios.'],
  ['Cuenta ficticia para comprobar saldos.', 'Importe acordado y seguimiento de abonos.'],
  ['Información interna ficticia.', 'Seguimiento del servicio y coordinación del equipo.'],
  ['Proveedor ficticio DEMO', 'Suministros Caninos del Valle'],
  ['Cliente de demostración', 'Sofía Solano'],
  ['Devolución parcial ficticia.', 'Devolución parcial registrada.'],
  ['Movimiento ficticio; conserva propietario.', 'Cambio de ubicación y custodia.'],
  ['Demostración.', 'Seguimiento de la unidad.'],
  ['Registro ficticio DEMO', 'Registro ORYX'],
  ['Comprobante ficticio de pago', 'Comprobante de pago'],
  ['Contrato ficticio de demostración', 'Contrato de servicios'],
  ['Centro de demostración ORYX', 'Centro ORYX'],
  ['Ingreso ficticio DEMO', 'Ingreso de inventario'],
  ['Baja de demostración', 'Baja de inventario'],
  ['Consumo de demostración', 'Consumo operativo'],
];
export function cleanText(value) {
  let text = value;
  for (const [from, to] of replacements) text = text.replaceAll(from, to);
  return text
    .replace(/DEMO-/g, 'ORYX-')
    .replace(/ · DEMO| DEMO|DEMO /g, '')
    .replace(/ de demostración/g, '')
    .replace(/ fictici[oa]s?/g, '')
    .replace(/ para pruebas/g, '')
    .replace(/ para observar evolución/g, ' de evolución')
    .replace(/demostracion\.pdf/gi, 'registro-oryx.pdf');
}
export function cleanValue(value) {
  if (typeof value === 'string') return cleanText(value);
  if (Array.isArray(value)) return value.map(cleanValue);
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, cleanValue(v)]));
  return value;
}
