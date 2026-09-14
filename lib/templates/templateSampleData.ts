export function getSampleValuesForTemplate(templateId: string): Record<string, string | string[]> {
  switch (templateId) {
    case 'amparo-indirecto':
      return {
        autoridad_competente: 'C. JUEZ DE DISTRITO EN MATERIA ADMINISTRATIVA EN TURNO EN LA CIUDAD DE MÉXICO',
        expediente: 'Inicial',
        tipo_procedimiento: 'Demanda de Amparo Indirecto',
        quejoso: 'JUAN CARLOS MENDOZA ROBLES',
        personalidad: 'Por mi propio derecho, con capacidad legal plena para promover la presente demanda de amparo.',
        domicilio_procesal: 'Av. Insurgentes Sur No. 1602, Piso 4, Col. Crédito Constructor, Alcaldía Benito Juárez, C.P. 03940, Ciudad de México.',
        personas_autorizadas: [
          'Lic. Roberto Valenzuela Sánchez (Cédula Profesional No. 8492014)',
          'Lic. María Elena Torres Rangel (Cédula Profesional No. 9102482)'
        ],
        tercero_interesado: ['Inmobiliaria y Desarrollos del Centro, S.A. de C.V.'],
        autoridades_responsables: [
          'C. Director General de Licencias y Manifestaciones de Construcción de la Alcaldía Benito Juárez',
          'C. Instituto de Verificación Administrativa de la Ciudad de México (INVEA)'
        ],
        acto_reclamado: 'La orden de clausura intempestiva y carente de la debida fundamentación y motivación emitida en fecha 28 de julio de 2026 dentro del expediente administrativo INVEA/OV/0492/2026.',
        fecha_conocimiento: '29 de julio de 2026',
        antecedentes: '1. El suscrito es titular de los derechos de uso del inmueble ubicado en Av. Universidad 1200.\n2. En fecha 28 de julio de 2026 la autoridad responsable colocó sellos de clausura sin notificar formalmente el acuerdo de inicio de procedimiento ni otorgar el derecho de audiencia previa.',
        hechos: [
          'El día 28 de julio de 2026, notificadores de la autoridad responsable se presentaron en el domicilio señalado ordenando el cierre inmediato del inmueble.',
          'No se hizo entrega de copia cotejada de la orden administrativa ni de la orden de visita correspondiente, violando el debido proceso.'
        ],
        fundamentos_juridicos: 'Artículos 1o., 14, 16 y 17 de la Constitución Política de los Estados Unidos Mexicanos; artículos 1, 107 y 108 de la Ley de Amparo.',
        derechos_violados: 'Derecho a la seguridad jurídica, garantía de audiencia previa, principio de legalidad y debido proceso legal consagrados en los artículos 14 y 16 Constitucionales.',
        conceptos_violacion: [
          'PRIMERO. VIOLACIÓN AL ARTÍCULO 14 CONSTITUCIONAL (GARANTÍA DE AUDIENCIA).— El acto reclamado priva al suscrito de sus derechos sin que previamente se haya seguido un juicio o procedimiento en el que se cumplan las formalidades esenciales del procedimiento.',
          'SEGUNDO. VIOLACIÓN AL ARTÍCULO 16 CONSTITUCIONAL (FUNDAMENTACIÓN Y MOTIVACIÓN).— La resolución de clausura omite citar con precisión los preceptos legales aplicables y las razones particulares que justifiquen la medida extrema de clausura.'
        ],
        suspension: 'Solicito se conceda la SUSPENSIÓN PROVISIONAL y en su oportunidad la DEFINITIVA del acto reclamado, a efecto de que se retiren los sellos de clausura y las cosas se mantengan en el estado que actualmente guardan.',
        pruebas: [
          'DOCUMENTAL PÚBLICA.— Consistente en la copia certificada de la identificación oficial y título de posesión del inmueble.',
          'INSTRUMENTAL DE ACTUACIONES.— Consistente en todo lo actuado en el presente juicio que favorezca a los intereses del quejoso.',
          'PRESUNCIONAL LEGAL Y HUMANA.— En todo lo que beneficie al derecho del suscrito.'
        ],
        puntos_petitorios: [
          'PRIMERO.— Tenerme por presentado en tiempo y forma promoviendo Demanda de Amparo Indirecto.',
          'SEGUNDO.— Conceder la suspensión provisional del acto reclamado y fijar fecha para la audiencia incidental.',
          'TERCERO.— Previo trámite de ley, dictar sentencia concediendo el Amparo y Protección de la Justicia Federal.'
        ],
        protesta: 'PROTESTO LO NECESARIO',
        lugar_fecha: 'Ciudad de México, a 3 de agosto de 2026',
        firma: 'JUAN CARLOS MENDOZA ROBLES',
        lista_anexos: [
          'Anexo 1: Copia de identificación oficial del quejoso.',
          'Anexo 2: Fotografías fehacientes de la imposición de sellos.',
          'Anexo 3: Copias simples de la demanda para correr traslado a las partes.'
        ]
      };
    case 'suspension-amparo':
      return {
        autoridad_competente: 'C. JUEZ DE DISTRITO EN MATERIA ADMINISTRATIVA EN TURNO EN LA CIUDAD DE MÉXICO',
        expediente: '1048/2026',
        tipo_procedimiento: 'Incidente de Suspensión',
        quejoso: 'JUAN CARLOS MENDOZA ROBLES',
        personalidad: 'Por mi propio derecho en mi carácter de parte quejosa.',
        domicilio_procesal: 'Av. Insurgentes Sur No. 1602, Piso 4, Benito Juárez, CDMX.',
        personas_autorizadas: ['Lic. Roberto Valenzuela Sánchez'],
        tercero_interesado: ['Inmobiliaria y Desarrollos del Centro, S.A. de C.V.'],
        autoridades_responsables: ['C. Director General de Licencias y Manifestaciones de Construcción'],
        acto_reclamado: 'La orden de clausura y suspensión de actividades del establecimiento.',
        antecedentes: 'En el cuaderno principal del juicio de amparo 1048/2026 se promovió demanda de amparo contra el acto de clausura.',
        hechos: [
          'La ejecución inmediata del acto reclamado causará daños irreparables a la fuente de empleo y al patrimonio del solicitante.',
          'No se sigue perjuicio al interés social ni se contravienen disposiciones de orden público con la concesión de la medida cautelar.'
        ],
        suspension: 'Solicito formalmente la suspensión provisional y en su momento la definitiva para mantener las cosas en el estado en que se encuentran y permitir el acceso al inmueble.',
        pruebas: ['Documental pública acreditando posesión', 'Presuncional legal y humana'],
        puntos_petitorios: [
          'PRIMERO.— Conceder la suspensión provisional solicitada.',
          'SEGUNDO.— Expedir a mi costa copia certificada del auto que conceda la suspensión.'
        ],
        protesta: 'PROTESTO LO NECESARIO',
        lugar_fecha: 'Ciudad de México, a 3 de agosto de 2026',
        firma: 'JUAN CARLOS MENDOZA ROBLES',
        lista_anexos: ['Anexo 1: Copias para traslado.']
      };
    default:
      return {
        autoridad_competente: 'C. JUEZ DE LO CIVIL EN TURNO EN LA CIUDAD DE MÉXICO',
        expediente: 'Inicial',
        tipo_procedimiento: 'Juicio Ordinario Civil',
        quejoso: 'MARÍA FERNANDA LÓPEZ HERNÁNDEZ',
        promovente: 'MARÍA FERNANDA LÓPEZ HERNÁNDEZ',
        actor: 'MARÍA FERNANDA LÓPEZ HERNÁNDEZ',
        demandado: 'CARLOS ALBERTO GÓMEZ SILVA',
        personalidad: 'Por mi propio derecho en pleno ejercicio de mis derechos civiles.',
        domicilio_procesal: 'Calle Reforma No. 222, Piso 8, Cuauhtémoc, CDMX.',
        personas_autorizadas: ['Lic. Alejandro Morales Cruz (Cédula Prof. 7483920)'],
        tercero_interesado: ['No se señala'],
        autoridades_responsables: ['No aplica'],
        prestaciones: [
          'A) La rescisión del contrato de arrendamiento suscrito el 15 de enero de 2025.',
          'B) El pago de la cantidad de $45,000.00 MXN por concepto de rentas adeudadas.',
          'C) El pago de gastos y costas que el presente juicio origine.'
        ],
        hechos: [
          'El día 15 de enero de 2025 la actora y el demandado celebraron contrato de arrendamiento respecto del inmueble ubicado en Calle Liverpool 45.',
          'El demandado omitió realizar el pago correspondiente a los meses de mayo, junio y julio del año 2026.'
        ],
        acto_reclamado: 'El incumplimiento contractual objeto del presente juicio.',
        fecha_conocimiento: '01 de mayo de 2026',
        antecedentes: 'Se entablaron negociaciones extrajudiciales sin lograr respuesta satisfactoria.',
        fundamentos_juridicos: 'Artículos 2398, 2448 y demás relativos del Código Civil para la Ciudad de México.',
        derechos_violados: 'Derecho de propiedad y cumplimiento de obligaciones contractuales.',
        conceptos_violacion: ['Infracción directa al principio pacta sunt servanda.'],
        agravios: ['La omisión de valorar las pruebas documentales ofrecidas.'],
        suspension: 'No aplica.',
        pruebas: [
          '1. DOCUMENTAL PRIVADA.— Contrato original de arrendamiento de fecha 15 de enero de 2025.',
          '2. CONFESIONAL.— A cargo del demandado CARLOS ALBERTO GÓMEZ SILVA al tenor del pliego de posiciones.'
        ],
        puntos_petitorios: [
          'PRIMERO.— Tenerme por presentada en la vía y forma propuestas demandando las prestaciones señaladas.',
          'SEGUNDO.— Emplazar al demandado en el domicilio indicado.',
          'TERCERO.— En su oportunidad, dictar sentencia definitiva declarando procedente la acción.'
        ],
        protesta: 'PROTESTO LO NECESARIO',
        lugar_fecha: 'Ciudad de México, a 3 de agosto de 2026',
        firma: 'MARÍA FERNANDA LÓPEZ HERNÁNDEZ',
        lista_anexos: ['Anexo 1: Contrato de arrendamiento original.']
      };
  }
}
