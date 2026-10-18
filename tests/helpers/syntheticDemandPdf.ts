import { buildSyntheticPdf } from './syntheticPdf';

/**
 * Demandas SINTÉTICAS de varias páginas para trazar la generación de contestaciones
 * de punta a punta. Todos los nombres, domicilios, fechas y folios son inventados.
 * Cada demanda se dirige al órgano en el encabezado y contiene las trampas reales:
 * "C. JUEZ…", "ESTE H. JUZGADO", vocabulario incidental de otras materias.
 */
export interface SyntheticDemand {
  id: string;
  matter: 'CIVIL' | 'LABORAL' | 'MERCANTIL';
  contestacionType: string;
  actor: string;
  demandado: string;
  court: string;
  expediente: string;
  /** Hechos numerados que la contestación debe atender uno por uno. */
  facts: string[];
  paragraphs: string[];
}

function wrap(paragraph: string, width = 88): string[] {
  const words = paragraph.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if ((line + ' ' + word).trim().length > width) {
      lines.push(line.trim());
      line = word;
    } else line = `${line} ${word}`;
  }
  if (line.trim()) lines.push(line.trim());
  return lines.length ? lines : [''];
}

export function demandToPages(demand: SyntheticDemand, linesPerPage = 46): string[][] {
  const lines = demand.paragraphs.flatMap((paragraph) => [...wrap(paragraph), '']);
  const pages: string[][] = [];
  for (let index = 0; index < lines.length; index += linesPerPage) pages.push(lines.slice(index, index + linesPerPage));
  return pages;
}

export function demandToPdf(demand: SyntheticDemand): Buffer {
  return buildSyntheticPdf(demandToPages(demand));
}

export function demandToText(demand: SyntheticDemand): string {
  return demand.paragraphs.join('\n');
}

const CIVIL_FACTS = [
  'El 3 de marzo de 2024 la actora, en su carácter de arrendataria, celebró con INMOBILIARIA LOS FRESNOS, S.A. DE C.V. un contrato de arrendamiento respecto del local comercial número 4 ubicado en la Plaza Sintética, con una vigencia de tres años y una renta mensual de $28,000.00.',
  'En la cláusula quinta del contrato la arrendadora se obligó a entregar el local con licencia de uso de suelo vigente y en condiciones de higiene y seguridad para la operación de una cafetería.',
  'La actora pagó por adelantado un depósito en garantía equivalente a dos meses de renta, es decir, $56,000.00, mediante transferencia del 4 de marzo de 2024.',
  'El 15 de marzo de 2024 la actora recibió las llaves del local; ese mismo día advirtió filtraciones de agua en el techo del área de cocina y lo comunicó por correo electrónico a la administradora del inmueble.',
  'En la junta de condóminos celebrada el 10 de abril de 2024 se informó que el inmueble carecía de licencia de uso de suelo para giros con venta de alimentos, circunstancia que la arrendadora nunca reveló a la actora.',
  'El 22 de abril de 2024 personal de la autoridad municipal realizó una visita de verificación y colocó sellos de suspensión de actividades por falta de licencia de uso de suelo compatible.',
  'La actora requirió por escrito a la arrendadora el 25 de abril de 2024 para que regularizara la licencia y reparara las filtraciones en un plazo de quince días; la arrendadora no dio respuesta.',
  'Desde el 22 de abril de 2024 la actora no ha podido operar la cafetería, pese a haber invertido $410,000.00 en mobiliario, equipo y adecuaciones autorizadas por la propia arrendadora.',
  'La actora continuó pagando las rentas de mayo, junio y julio de 2024 para evitar la rescisión por falta de pago, con la expectativa de que la arrendadora cumpliera sus obligaciones.',
  'El 1 de agosto de 2024 la arrendadora exigió el pago de rentas adicionales y cuotas de mantenimiento, sin haber regularizado la licencia ni reparado las filtraciones.',
  'El patrón de incumplimiento de la arrendadora se repitió con otros dos locatarios de la plaza, quienes también sufrieron la suspensión de actividades por la misma causa.',
  'Ante la imposibilidad de usar el local para el destino pactado, la actora desocupó el inmueble el 30 de septiembre de 2024 y entregó las llaves ante fedatario público.',
  'A la fecha la arrendadora no ha devuelto el depósito en garantía ni ha resarcido las inversiones realizadas, por lo que se ve obligada a promover el presente juicio.',
];

export const CIVIL_ARRENDAMIENTO_DEMAND: SyntheticDemand = {
  id: 'sint-civil-arrendamiento',
  matter: 'CIVIL',
  contestacionType: 'contestacion_demanda_civil',
  actor: 'ROSALBA QUINTERO MÉNDEZ',
  demandado: 'INMOBILIARIA LOS FRESNOS',
  court: 'JUEZ TERCERO DE LO CIVIL DEL PRIMER PARTIDO JUDICIAL',
  expediente: '1450/2025',
  facts: CIVIL_FACTS,
  paragraphs: [
    'C. JUEZ TERCERO DE LO CIVIL DEL PRIMER PARTIDO JUDICIAL',
    'DEL ESTADO DE JALISCO.',
    'P R E S E N T E.',
    'EXPEDIENTE: 1450/2025',
    'ROSALBA QUINTERO MÉNDEZ, mexicana, mayor de edad, por mi propio derecho, señalando como domicilio para oír y recibir notificaciones el ubicado en la calle Ficticia número 100, colonia Inventada, y autorizando para tales efectos al licenciado Mario Gil Sintético, ante ESTE H. JUZGADO, con el debido respeto comparezco y expongo:',
    'Que por medio del presente escrito vengo a demandar en la vía ordinaria civil a INMOBILIARIA LOS FRESNOS, S.A. DE C.V., con domicilio en Avenida Inventada número 200, colonia Ficticia, por el pago y cumplimiento de las siguientes:',
    'PRESTACIONES',
    'A) La rescisión del contrato de arrendamiento celebrado el 3 de marzo de 2024 respecto del local comercial número 4 de la Plaza Sintética, por causas imputables a la arrendadora.',
    'B) La devolución del depósito en garantía por la cantidad de $56,000.00.',
    'C) El pago de $410,000.00 por concepto de daños derivados de las inversiones realizadas en el local.',
    'D) El pago de los perjuicios consistentes en las ganancias lícitas dejadas de percibir desde el 22 de abril de 2024.',
    'E) El pago de gastos y costas que el presente juicio origine.',
    'HECHOS',
    ...CIVIL_FACTS.map((fact, index) => `${index + 1}. ${fact}`),
    'PRUEBAS',
    '1. DOCUMENTAL PRIVADA. Consistente en el contrato de arrendamiento del 3 de marzo de 2024.',
    '2. DOCUMENTAL PRIVADA. Consistente en el comprobante de transferencia del depósito en garantía.',
    '3. DOCUMENTAL PÚBLICA. Consistente en el acta de visita de verificación municipal del 22 de abril de 2024.',
    '4. DOCUMENTAL PRIVADA. Consistente en el requerimiento escrito del 25 de abril de 2024.',
    '5. TESTIMONIAL. A cargo de dos locatarios de la Plaza Sintética.',
    '6. PERICIAL EN MATERIA CONTABLE. Para cuantificar las inversiones y las ganancias dejadas de percibir.',
    '7. INSTRUMENTAL DE ACTUACIONES Y PRESUNCIONAL LEGAL Y HUMANA.',
    'DERECHO',
    'Son aplicables al fondo del asunto los artículos 1793, 2412, 2413, 2421 y 2489 del Código Civil del Estado de Jalisco, y al procedimiento los artículos 267, 268 y demás relativos del Código de Procedimientos Civiles del Estado de Jalisco.',
    'Por lo anteriormente expuesto y fundado, a Usted C. Juez, atentamente pido:',
    'PUNTOS PETITORIOS',
    'PRIMERO. Tenerme por presentada demandando en la vía ordinaria civil a INMOBILIARIA LOS FRESNOS, S.A. DE C.V.',
    'SEGUNDO. Ordenar el emplazamiento de la demandada en el domicilio señalado.',
    'TERCERO. En su oportunidad, dictar sentencia condenando a la demandada al pago de las prestaciones reclamadas.',
    'PROTESTO LO NECESARIO',
    'Guadalajara, Jalisco, a 2 de mayo de 2025.',
    'ROSALBA QUINTERO MÉNDEZ',
  ],
};

const LABOR_FACTS = [
  'El 5 de enero de 2020 el actor ingresó a laborar para TRANSPORTES DEL NORTE ÁGIL, S.A. DE C.V. con el puesto de chofer de ruta foránea, por tiempo indeterminado.',
  'El actor percibía un salario diario integrado de $780.00 y una jornada de lunes a sábado de las 6:00 a las 18:00 horas, con media hora para tomar alimentos.',
  'Durante toda la relación laboral el actor laboró tres horas extraordinarias diarias que nunca le fueron pagadas.',
  'El 30 de junio de 2025, a las 9:00 horas, en las instalaciones de la empresa, el gerente de operaciones comunicó verbalmente al actor que estaba despedido, sin entregarle aviso escrito de las causas.',
  'La demandada no pagó al actor el aguinaldo proporcional ni la prima vacacional correspondientes a 2025.',
  'La demandada no inscribió al actor en el régimen obligatorio del seguro social con el salario real.',
];

export const LABORAL_DESPIDO_DEMAND: SyntheticDemand = {
  id: 'sint-laboral-despido',
  matter: 'LABORAL',
  contestacionType: 'contestacion_demanda_laboral',
  actor: 'JOAQUÍN ESTRADA PALMA',
  demandado: 'TRANSPORTES DEL NORTE ÁGIL',
  court: 'TRIBUNAL LABORAL FEDERAL DE ASUNTOS INDIVIDUALES',
  expediente: '880/2025',
  facts: LABOR_FACTS,
  paragraphs: [
    'TRIBUNAL LABORAL FEDERAL DE ASUNTOS INDIVIDUALES',
    'EN EL ESTADO DE NUEVO LEÓN.',
    'P R E S E N T E.',
    'EXPEDIENTE: 880/2025',
    'JOAQUÍN ESTRADA PALMA, mexicano, mayor de edad, por mi propio derecho, ante ESTE H. TRIBUNAL comparezco y expongo:',
    'Que vengo a demandar a TRANSPORTES DEL NORTE ÁGIL, S.A. DE C.V., con domicilio en Calle Sintética número 9, el cumplimiento de las siguientes:',
    'PRESTACIONES',
    'A) La reinstalación en el puesto de chofer de ruta foránea en los mismos términos y condiciones.',
    'B) El pago de salarios caídos desde el despido injustificado.',
    'C) El pago de aguinaldo y prima vacacional proporcionales de 2025.',
    'D) El pago de tiempo extraordinario laborado y no pagado.',
    'HECHOS',
    ...LABOR_FACTS.map((fact, index) => `${index + 1}. ${fact}`),
    'PRUEBAS',
    '1. CONFESIONAL. A cargo del representante legal de la demandada.',
    '2. TESTIMONIAL. A cargo de dos compañeros de trabajo.',
    '3. INSPECCIÓN. Sobre listas de asistencia y recibos de nómina.',
    'DERECHO',
    'Son aplicables los artículos 47, 48, 50, 67, 76, 80 y 87 de la Ley Federal del Trabajo.',
    'PUNTOS PETITORIOS',
    'PRIMERO. Tenerme por presentado demandando a la empresa señalada.',
    'SEGUNDO. Condenar a la demandada al pago de las prestaciones reclamadas.',
    'PROTESTO LO NECESARIO',
    'Monterrey, Nuevo León, a 15 de julio de 2025.',
    'JOAQUÍN ESTRADA PALMA',
  ],
};

const MERCANTIL_FACTS = [
  'El 10 de enero de 2025 COMERCIALIZADORA DEL BAJÍO, S.A. DE C.V. suscribió a favor de la actora un pagaré por la cantidad de $350,000.00, con vencimiento el 10 de julio de 2025.',
  'En el pagaré se pactó un interés moratorio del tres por ciento mensual sobre saldos insolutos.',
  'Llegada la fecha de vencimiento, la actora requirió extrajudicialmente el pago a la suscriptora, quien se negó a cubrir el importe del título.',
  'A la fecha la demandada no ha realizado pago alguno, por lo que el título de crédito es exigible en la vía ejecutiva mercantil.',
];

export const MERCANTIL_PAGARE_DEMAND: SyntheticDemand = {
  id: 'sint-mercantil-pagare',
  matter: 'MERCANTIL',
  contestacionType: 'contestacion_demanda_mercantil',
  actor: 'DISTRIBUIDORA ALFA SINTÉTICA',
  demandado: 'COMERCIALIZADORA DEL BAJÍO',
  court: 'JUEZ SEGUNDO DE LO MERCANTIL',
  expediente: '233/2025',
  facts: MERCANTIL_FACTS,
  paragraphs: [
    'C. JUEZ SEGUNDO DE LO MERCANTIL DEL PRIMER PARTIDO JUDICIAL.',
    'P R E S E N T E.',
    'EXPEDIENTE: 233/2025',
    'ELENA RAMOS VIDAL, en mi carácter de apoderada legal de DISTRIBUIDORA ALFA SINTÉTICA, S.A. DE C.V., personalidad que acredito con el testimonio notarial que se acompaña, ante ESTE H. JUZGADO comparezco y expongo:',
    'Que en nombre de mi representada vengo a demandar en la vía ejecutiva mercantil a COMERCIALIZADORA DEL BAJÍO, S.A. DE C.V., con domicilio en Bulevar Imaginario número 45, el pago de las siguientes:',
    'PRESTACIONES',
    'A) El pago de $350,000.00 como suerte principal.',
    'B) El pago de intereses moratorios al tres por ciento mensual.',
    'C) El pago de gastos y costas.',
    'HECHOS',
    ...MERCANTIL_FACTS.map((fact, index) => `${index + 1}. ${fact}`),
    'DERECHO',
    'Son aplicables los artículos 1391 fracción IV y 1392 del Código de Comercio y 150, 170 y 174 de la Ley General de Títulos y Operaciones de Crédito.',
    'PUNTOS PETITORIOS',
    'PRIMERO. Tenerme por presentada en representación de la actora.',
    'SEGUNDO. Despachar auto de exequendo y requerir de pago a la demandada.',
    'PROTESTO LO NECESARIO',
    'León, Guanajuato, a 20 de julio de 2025.',
    'ELENA RAMOS VIDAL',
  ],
};

export const SYNTHETIC_DEMANDS = [CIVIL_ARRENDAMIENTO_DEMAND, LABORAL_DESPIDO_DEMAND, MERCANTIL_PAGARE_DEMAND];
