/**
 * Estructura canónica del recurso de apelación civil tal como la declara
 * documentPlan.ts (CANONICAL_APPEAL_CIVIL_STRUCTURE), con el sectionType que
 * resolve inferSectionType para cada título. Fixture de pruebas solamente.
 */
export const CANONICAL_APPEAL_CIVIL_TEST_SECTIONS: Array<{ id: string; title: string; type: string }> = [
  { id: 'sec-apelacion-proemio', title: 'PROEMIO', type: 'identity' },
  { id: 'sec-apelacion-rubro', title: 'RUBRO / AUTORIDAD', type: 'header' },
  { id: 'sec-apelacion-asunto', title: 'IDENTIFICACIÓN DEL ASUNTO', type: 'identity' },
  { id: 'sec-apelacion-comparecencia', title: 'COMPARECENCIA Y PERSONALIDAD', type: 'identity' },
  { id: 'sec-apelacion-objeto', title: 'OBJETO: INTERPOSICIÓN DEL RECURSO', type: 'custom' },
  { id: 'sec-apelacion-procedencia', title: 'PROCEDENCIA Y OPORTUNIDAD', type: 'legal_grounds' },
  { id: 'sec-apelacion-recurrida', title: 'RESOLUCIÓN RECURRIDA', type: 'background' },
  { id: 'sec-apelacion-impugnada', title: 'RESOLUCIÓN IMPUGNADA', type: 'background' },
  { id: 'sec-apelacion-antecedentes', title: 'ANTECEDENTES PROCESALES', type: 'background' },
  { id: 'sec-apelacion-combatidas', title: 'CONSIDERACIONES COMBATIDAS', type: 'custom' },
  { id: 'sec-apelacion-agravios', title: 'AGRAVIOS', type: 'argument' },
  { id: 'sec-apelacion-fundamentacion', title: 'FUNDAMENTACIÓN / CRITERIOS VERIFICADOS', type: 'legal_grounds' },
  { id: 'sec-apelacion-efectos', title: 'EFECTOS SOLICITADOS A LA ALZADA', type: 'custom' },
  { id: 'sec-apelacion-petitorios', title: 'PUNTOS PETITORIOS', type: 'petition' },
  { id: 'sec-apelacion-protesto', title: 'PROTESTO', type: 'closing' },
  { id: 'sec-apelacion-lugar-fecha', title: 'LUGAR / FECHA', type: 'custom' },
  { id: 'sec-apelacion-firma', title: 'FIRMA', type: 'signature' },
];