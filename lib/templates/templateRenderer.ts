import { ProfessionalTemplate, RenderedDocument } from './templateTypes';
import { DRAFT_WARNING, hasPendingMarkers } from './templateQuality';
import { normalizeLegalDocumentText } from '@/lib/text/normalizeLegalDisplayText';

export interface TemplateValidationResult {
  valid: boolean;
  missingFieldIds: string[];
  missingFields: Array<{ id: string; title: string }>;
}

const hasMeaningfulValue = (value: string | string[] | undefined): boolean => {
  if (Array.isArray(value)) {
    return value.some((item) => item.trim().length > 0);
  }
  return typeof value === 'string' && value.trim().length > 0;
};

export const validateTemplateValues = (
  template: ProfessionalTemplate,
  values: Record<string, string | string[]>
): TemplateValidationResult => {
  const missingFields = template.sections
    .filter((section) => section.required && !hasMeaningfulValue(values[section.id]))
    .map((section) => ({ id: section.id, title: section.title }));

  return {
    valid: missingFields.length === 0,
    missingFieldIds: missingFields.map((field) => field.id),
    missingFields,
  };
};

const numberToOrdinal = (num: number): string => {
  const ordinals = ['PRIMERO', 'SEGUNDO', 'TERCERO', 'CUARTO', 'QUINTO', 'SEXTO', 'SÉPTIMO', 'OCTAVO', 'NOVENO', 'DÉCIMO', 'DÉCIMO PRIMERO', 'DÉCIMO SEGUNDO', 'DÉCIMO TERCERO', 'DÉCIMO CUARTO', 'DÉCIMO QUINTO', 'DÉCIMO SEXTO', 'DÉCIMO SÉPTIMO', 'DÉCIMO OCTAVO', 'DÉCIMO NOVENO', 'VIGÉSIMO'];
  return ordinals[num - 1] || `${num}º`;
};

export const renderToDocument = (
  template: ProfessionalTemplate,
  values: Record<string, string | string[]>,
  options?: { generatedAt?: string | number }
): RenderedDocument => {
  const getVal = (id: string, label: string, isArray: boolean = false) => {
    const val = values[id];
    if (isArray) {
      const items = (Array.isArray(val) ? val : val ? [val] : [])
        .map((item) => normalizeLegalDocumentText(item))
        .filter(Boolean);
      return items.length > 0 ? items : [`[PENDIENTE: ${label}]`];
    }
    if (!val || (typeof val === 'string' && val.trim().length === 0)) {
      return `[PENDIENTE: ${label}]`;
    }
    return Array.isArray(val) ? val.map(normalizeLegalDocumentText).join(', ') : normalizeLegalDocumentText(val);
  };

  // ── CUSTOM TEMPLATES WITH ORIGINAL TEXT ───────────────────────────────────
  if (template.originalText && template.originalText.trim().length > 0) {
    let customText = normalizeLegalDocumentText(template.originalText);

    // Substitute any section values entered into the custom template text
    for (const sec of template.sections) {
      const val = values[sec.id];
      if (hasMeaningfulValue(val)) {
        const strVal = Array.isArray(val) ? val.join(', ') : val;
        const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        customText = customText
          .replace(new RegExp(`\\[PENDIENTE:\\s*${escapeRegExp(sec.title)}\\]`, 'gi'), strVal)
          .replace(new RegExp(`\\[PENDIENTE:\\s*${escapeRegExp(sec.id)}\\]`, 'gi'), strVal)
          .replace(new RegExp(`\\{${escapeRegExp(sec.id)}\\}`, 'gi'), strVal)
          .replace(new RegExp(`\\{${escapeRegExp(sec.title)}\\}`, 'gi'), strVal);
      }
    }

    const validation = validateTemplateValues(template, values);
    const sections: RenderedDocument['sections'] = [];

    if (!validation.valid) {
      sections.push({
        title: 'DATOS OBLIGATORIOS PENDIENTES',
        content: validation.missingFields.map((field) => `[PENDIENTE: ${field.title}]`),
        numbered: false,
      });
    }

    sections.push({
      title: template.title.toUpperCase(),
      content: customText,
      numbered: false,
    });

    const pendingMetadata = [
      template.legalBasis,
      ...template.applicableLaws,
      ...template.warnings,
    ].filter((value) => hasPendingMarkers(value));
    const documentHasPendingMarkers = hasPendingMarkers([customText]);

    sections.unshift({
      title: DRAFT_WARNING,
      content: pendingMetadata.length > 0 || documentHasPendingMarkers
        ? 'Este documento conserva campos jurídicos pendientes de validar.'
        : 'Este documento fue generado a partir de una plantilla y debe ser revisado por un profesional del derecho antes de presentarse.',
      numbered: false,
    });

    return {
      title: template.title,
      header: `${template.title.toUpperCase()}\n${template.legalBasis ? `FUNDAMENTO: ${template.legalBasis}\n` : ''}\n`,
      expediente: (values['expediente'] as string) || '',
      body: '',
      sections,
      footer: `\n___________________________\nFIRMA / PROMOVENTE\n`,
      warnings: template.warnings,
      disclaimer: template.disclaimer,
      generatedAt: options?.generatedAt ? new Date(options.generatedAt).toISOString() : new Date().toISOString()
    };
  }

  // ── DYNAMIC SECTION-BASED TEMPLATES ──────────────────────────────────────
  const doc: RenderedDocument = {
    title: template.title,
    header: '',
    expediente: getVal('expediente', 'Expediente') as string,
    body: '',
    sections: [],
    footer: '',
    warnings: template.warnings,
    disclaimer: template.disclaimer,
    generatedAt: options?.generatedAt ? new Date(options.generatedAt).toISOString() : new Date().toISOString()
  };

  const hasSection = (id: string) => template.sections.some((s) => s.id === id);

  const authLabel = template.sections.find((s) => s.id === 'autoridad_competente' || s.id === 'autoridad')?.title || 'Autoridad competente';
  const auth = hasSection('autoridad_competente') || hasSection('autoridad')
    ? getVal(hasSection('autoridad_competente') ? 'autoridad_competente' : 'autoridad', authLabel)
    : (hasSection('autoridad') ? getVal('autoridad', 'Autoridad') : getVal('autoridad_competente', 'Autoridad competente'));

  const exp = values['expediente'] ? `EXPEDIENTE: ${values['expediente']}` : '';
  const tipo = values['tipo_procedimiento'] || values['tipo_juicio'] ? `ASUNTO: ${values['tipo_procedimiento'] || values['tipo_juicio']}` : '';

  const actorName = values['actor'] || values['quejoso'] || values['promovente'] || '';
  const actor = actorName ? `${actorName}` : '';

  const vsVal =
    values['demandado'] ||
    values['contraparte'] ||
    values['autoridades_responsables'];
  const vs = vsVal ? `VS\n${Array.isArray(vsVal) ? vsVal[0] : vsVal}` : '';

  doc.header = `${auth}\nPRESENTE.\n\n`;
  if (exp) doc.header += `${exp}\n`;
  if (tipo) doc.header += `${tipo}\n`;
  if (actor) doc.header += `${actor}\n`;
  if (vs) doc.header += `${vs}\n`;

  let intro = '';
  if (actorName) {
    intro += `${actorName}`;
    if (values['personalidad']) intro += `, ${values['personalidad']}`;
    if (values['domicilio_procesal'] || values['domicilio']) {
      intro += `, señalando como domicilio procesal el ubicado en ${values['domicilio_procesal'] || values['domicilio']}`;
    }
    if (values['personas_autorizadas']) {
      const auths = Array.isArray(values['personas_autorizadas']) ? values['personas_autorizadas'].join(', ') : values['personas_autorizadas'];
      intro += `, y autorizando para oír y recibir notificaciones a ${auths}`;
    }
    intro += `, ante Usted con el debido respeto comparezco y expongo:\n`;
  } else if (values['promoventes']) {
    intro += `${values['promoventes']}`;
    if (values['personalidad']) intro += `, ${values['personalidad']}`;
    if (values['domicilio_procesal'] || values['domicilio']) {
      intro += `, señalando como domicilio procesal el ubicado en ${values['domicilio_procesal'] || values['domicilio']}`;
    }
    if (values['personas_autorizadas']) {
      const auths = Array.isArray(values['personas_autorizadas'])
        ? values['personas_autorizadas'].join(', ')
        : values['personas_autorizadas'];
      intro += `, y autorizando para oír y recibir notificaciones a ${auths}`;
    }
    intro += ', ante Usted con el debido respeto comparecemos y exponemos:\n';
  }

  if (values['cuerpo_escrito']) {
    intro += `\n${values['cuerpo_escrito']}\n`;
  }

  doc.body = intro;

  const excludedFromSections = [
    'autoridad_competente', 'autoridad', 'expediente', 'tipo_procedimiento', 'tipo_juicio', 'actor', 'quejoso',
    'promovente', 'promoventes', 'personalidad', 'domicilio_procesal', 'domicilio', 'personas_autorizadas',
    'cuerpo_escrito', 'protesta', 'lugar_fecha', 'firma', 'lista_anexos', 'puntos_petitorios', 'firmas'
  ];

  for (const sec of template.sections) {
    if (excludedFromSections.includes(sec.id)) {
      continue;
    }

    const val = getVal(sec.id, sec.title, sec.type === 'repeatable');
    doc.sections.push({
      title: sec.title.toUpperCase(),
      content: val,
      numbered: [
        'hechos',
        'pruebas',
        'conceptos_violacion',
        'agravios',
        'prestaciones',
        'contestacion_prestaciones',
        'contestacion_hechos',
        'clausulas',
        'garantias_violadas',
        'fundamentos',
      ].includes(sec.id)
    });
  }

  const validation = validateTemplateValues(template, values);
  if (!validation.valid) {
    doc.sections.unshift({
      title: 'DATOS OBLIGATORIOS PENDIENTES',
      content: validation.missingFields.map(
        (field) => `[PENDIENTE: ${field.title}]`
      ),
      numbered: false,
    });
  }

  if (hasSection('puntos_petitorios')) {
    const petitoriosVal = getVal('puntos_petitorios', 'Puntos petitorios', true) as string[];
    doc.sections.push({
      title: 'PUNTOS PETITORIOS',
      content: petitoriosVal,
      numbered: true
    });
  }

  let footerStr = '';
  const protesta = hasSection('protesta') ? getVal('protesta', 'Protesta') : '';
  const lugarFecha = hasSection('lugar_fecha') || hasSection('firma') ? getVal(hasSection('lugar_fecha') ? 'lugar_fecha' : 'firma', 'Lugar y fecha') : '';
  const firma = hasSection('firma') ? getVal('firma', 'Firma') : '';

  if (protesta) footerStr += `\n${protesta}\n\n`;
  if (lugarFecha) footerStr += `${lugarFecha}\n\n\n`;

  if (values['firmas']) {
    footerStr += `${values['firmas']}\n`;
  } else if (firma) {
    footerStr += `___________________________\n${firma}\n`;
  }

  if (values['lista_anexos']) {
    const anexos = Array.isArray(values['lista_anexos']) ? values['lista_anexos'] : [values['lista_anexos']];
    footerStr += `\nANEXOS:\n`;
    anexos.forEach((a, i) => {
      footerStr += `${i + 1}. ${a}\n`;
    });
  }

  doc.footer = footerStr;

  const pendingMetadata = [
    template.legalBasis,
    ...(template.applicableLaws || []),
    ...(template.warnings || []),
  ].filter((value) => hasPendingMarkers(value));
  const documentHasPendingMarkers = hasPendingMarkers([
    doc.header,
    doc.body,
    doc.sections.map((section) => section.content),
    doc.footer,
  ]);

  doc.sections.unshift({
    title: DRAFT_WARNING,
    content: pendingMetadata.length > 0 || documentHasPendingMarkers
      ? (pendingMetadata.length > 0 ? pendingMetadata : 'Este documento conserva campos jurídicos pendientes de validar.')
      : 'Este documento fue generado a partir de una plantilla y debe ser revisado por un profesional del derecho antes de presentarse.',
    numbered: false,
  });

  return doc;
};

export const renderToText = (
  template: ProfessionalTemplate,
  values: Record<string, string | string[]>,
  options?: { generatedAt?: string | number }
): string => {
  const doc = renderToDocument(template, values, options);
  let text = '';

  text += doc.header + '\n';
  text += doc.body + '\n';

  doc.sections.forEach(sec => {
    text += `\n${sec.title}\n`;
    if (Array.isArray(sec.content)) {
      sec.content.forEach((item, i) => {
        if (sec.numbered) {
          text += `${numberToOrdinal(i + 1)}.— ${item}\n`;
        } else {
          text += `- ${item}\n`;
        }
      });
    } else {
      text += `${sec.content}\n`;
    }
  });

  text += doc.footer + '\n';
  text += `\nGenerado el: ${new Date(doc.generatedAt).toLocaleString('es-MX', {
    timeZone: 'America/Mexico_City',
  })}\n`;
  text += `\n---\n${doc.disclaimer}`;

  return text;
};
