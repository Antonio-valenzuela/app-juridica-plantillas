/**
 * Header-only skeleton transcribed from the real OCR cache used by the Phase 2b
 * offline replay. Personal names and all non-heading continuation text are
 * removed; page numbers and OCR header noise are retained verbatim.
 */
export const appealRealHeadingSkeleton = {
  id: 'appeal-real-heading-skeleton',
  pages: [
    { page: 5, text: '” E VISTO S:', chars: 13 },
    { page: 12, text: 'V. COSA JUZGADA. me E', chars: 21 },
    {
      page: 14,
      text: [
        'VI. ANÁLISIS SUBSIDIARIO DE LA ACCIÓN DE NULIDAD. - un',
        'VIL. CARGA DELA PRUEBA. ; e -',
        'VII. CAPACIDAD DE LA TESTADORA. i í o Ri',
      ].join('\n'),
      chars: 0,
    },
    { page: 16, text: 'X. ALCANCE DE LA JURISPRUDENCIA 1a./J. 157/2007, REGISTRO DIGITAL. a', chars: 0 },
    {
      page: 18,
      text: [
        'XII. SOBRE EL HECHO DE QUE [PERSONA] HAYA LLEVADO f sé',
        'XIII. SOBRE LA FALTA DE TESTIGOS. dime sa a pi',
      ].join('\n'),
      chars: 0,
    },
    { page: 20, text: 'XVI. FORMALIDADES DEL TESTAMENTO PÚBLICO ABIERTO. Fo Js', chars: 0 },
    {
      page: 22,
      text: [
        'XIX. SOBRE EL CRITERIO CON REGISTRO DIGITAL 170428. ¡',
        'XX. CARGA PROBATORIA Y VALORACIÓN DE LAS PRUEBAS. e o a',
      ].join('\n'),
      chars: 0,
    },
    {
      page: 38,
      text: [
        'XXI. LA MERA DESIGNACIÓN DE UNA NIETA COMO HEREDERA NO Si',
        'XXIV. SOBRE EL TESTAMENTO COMO ACTO SOLEMNE. - .',
        'XV. SOBRE EL CRITERIO RELATIVO ALA CAPACIDAD DEL TESTADOR. f | uE',
      ].join('\n'),
      chars: 0,
    },
    {
      page: 42,
      text: [
        'SEGUNDA: Se declara que, conforme a las constancias de autos, la',
        'TERCERA. Se declara que, de encontrarse debidamente certificada la 18;',
        'CUARTA. En consecuencia, se declara IMPROCEDENTE la acción de | de',
        'QUINTA. A mayor abundamiento, aun en el supuesto de que-no4e ma eo ,',
        'SEXTA. Se declara que la edad de ochenta y dos años de la testadora no | aaplic',
        'SÉPTIMA. Se declara que la jurisprudencia con registro digital 170428 4 N',
        'OCTAVA. Se absuelve a [PERSONA] de las prestaciones ; Ea .',
      ].join('\n'),
      chars: 0,
    },
    {
      page: 43,
      text: [
        'E DECIMA” CUARTA. Se absuelve a [PERSONA] de las 1',
        'DECIMA SEXTA. Respecto de la Dirección del Archivo de Instrumentos',
      ].join('\n'),
      chars: 0,
    },
    {
      page: 44,
      text: [
        'DÉCIMA SÉPTIMA: En cuanto al pago de gastos y costas, deberán',
        'DÉCIMA OCTAVA. Subsisten, para todos los efectos legales conducentes,',
        'DÉCIMA NOVENA. Una vez que la presente resolución cause ejecutoria, o',
        'VIGÉSIMA. Notifíquese personalmente alas partes, así mismo dese vista al',
      ].join('\n'),
      chars: 0,
    },
  ].map(page => ({ ...page, chars: page.text.length })),
};
