/**
 * Fase 2 · Parte 3 — salida sin invenciones ni andamiaje.
 *
 *  1. El validador detecta cada tipo de defecto (unitario).
 *  2. Respuestas de IA simuladas que intentan inventar un registro digital, presentar una
 *     alegación como probada, filtrar texto de prompt y duplicar un bloque: el pipeline
 *     las neutraliza o el validador las detecta.
 *  3. Una muestra por familia documental generada SIN proveedor no contiene andamiaje,
 *     citas sin respaldo ni bloques duplicados.
 *  4. El motor determinista no afirma hechos bajo protesta de decir verdad.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { runGenerationPipeline } from '@/lib/legal-engine/pipeline';
import { createSourceDocument } from '@/lib/legal-engine/context';
import { resolveWritingType, visibleWritingTypes } from '@/lib/catalog/writingTypeIdentity';
import {
  contextFromDocument,
  enforceOutputHygiene,
  neutralizeGeneratedText,
  validateGeneratedOutput,
  validateGeneratedText,
} from '@/lib/legal-engine/generatedOutputValidator';

const codes = (text: string, context = {}) => validateGeneratedText(text, context).map((finding) => finding.code);

describe('validador de salida — detección', () => {
  it('detecta andamiaje, fuga de prompt, JSON, ids de proveedor y placeholders técnicos', () => {
    expect(codes('DESARROLLO DE BLOQUE: HECHOS\nTexto.')).toContain('SCAFFOLDING');
    expect(codes('Texto.\nEn relación con los autos del expediente 12/2025...')).toContain('SCAFFOLDING');
    expect(codes('OBJETIVO DEL BLOQUE: redactar')).toContain('PROMPT_LEAK');
    expect(codes('Aquí tienes el texto solicitado.')).toContain('PROMPT_LEAK');
    expect(codes('```json\n{"blockId":"b1"}\n```')).toContain('JSON_LEAK');
    expect(codes('Generado con nvidia/nemotron-3-super-120b-a12b')).toContain('PROVIDER_ID');
    expect(codes('Estimado {{nombre_cliente}}, undefined')).toContain('IRRELEVANT_PLACEHOLDER');
  });

  it('no marca como andamiaje la prosa jurídica normal ni los marcadores de pendiente', () => {
    const prose = 'La parte actora refiere que celebró contrato. [DATO PENDIENTE: fecha del contrato] Se solicita tener por presentado el escrito.';
    expect(codes(prose)).toEqual([]);
  });

  it('una cita con artículo sin respaldo es bloqueo; con respaldo o marcada, no', () => {
    expect(codes('Conforme al artículo 2412 del Código Civil del Estado de Jalisco se rescinde.')).toContain('UNSUPPORTED_CITATION');
    expect(codes('Conforme al [NO VERIFICADO: artículo 2412 del Código Civil del Estado de Jalisco] se rescinde.')).not.toContain('UNSUPPORTED_CITATION');
    expect(codes('Conforme al artículo 2412 del Código Civil del Estado de Jalisco se rescinde.', {
      sourceTexts: ['La demanda invoca el artículo 2412 del Código Civil del Estado de Jalisco.'],
    })).not.toContain('UNSUPPORTED_CITATION');
  });

  it('un registro digital inventado es bloqueo; uno presente en la fuente, no', () => {
    expect(codes('Véase la tesis con registro digital 2012345.')).toContain('UNSUPPORTED_CITATION');
    expect(codes('Véase la tesis con registro digital 2012345.', { sourceTexts: ['Registro digital: 2012345'] })).not.toContain('UNSUPPORTED_CITATION');
  });

  it('hechos con identidad propia sin origen: expediente e importe bloquean', () => {
    expect(codes('Dentro del expediente 9981/2024 se condenó al pago de $ 45,000.00.')).toEqual(expect.arrayContaining(['FACT_WITHOUT_ORIGIN']));
    expect(codes('Dentro del expediente 9981/2024 se condenó al pago de $ 45,000.00.', {
      sourceTexts: ['Expediente 9981/2024. Se condena al pago de $ 45,000.00 por concepto de capital.'],
    })).toEqual([]);
  });

  it('una alegación presentada como probada es bloqueo; atribuida o con prueba, no', () => {
    expect(codes('Está plenamente acreditado que el demandado incumplió el contrato.')).toContain('ALLEGATION_AS_PROVEN');
    expect(codes('La actora manifiesta que quedó acreditado el incumplimiento.')).not.toContain('ALLEGATION_AS_PROVEN');
    expect(codes('La sentencia tuvo por acreditado el incumplimiento contractual.')).not.toContain('ALLEGATION_AS_PROVEN');
  });

  it('detecta bloques duplicados y encabezados repetidos, y exige estado borrador', () => {
    const paragraph = 'Se solicita que este órgano jurisdiccional tenga por presentado el escrito en tiempo y forma, y provea de conformidad con lo solicitado en el cuerpo del mismo.';
    const doc = {
      status: 'final',
      sections: [
        { id: 's1', title: 'PETITORIOS', type: 'petition', content: [{ id: 'b1', text: paragraph }] },
        { id: 's2', title: 'PETITORIOS', type: 'custom', content: [{ id: 'b2', text: paragraph }] },
      ],
    } as any;
    const result = validateGeneratedOutput(doc);
    expect(result.findings.map((finding) => finding.code)).toEqual(expect.arrayContaining(['DUPLICATE_BLOCK', 'REPEATED_HEADING', 'NOT_LABELED_DRAFT']));
    expect(result.ok).toBe(false);
  });
});

describe('neutralización determinista', () => {
  it('retira andamiaje y deduplica sin tocar la prosa jurídica', () => {
    const paragraph = 'La parte demandada niega los hechos y se opone a las pretensiones por carecer de acción y derecho para reclamarlas.';
    const input = `DESARROLLO DE BLOQUE: CONTESTACIÓN\n${paragraph}\n\n${paragraph}\n\nEn relación con los autos del expediente 1/2025...`;
    const { text, actions } = neutralizeGeneratedText(input);
    expect(text).toBe(paragraph);
    expect(actions.length).toBeGreaterThan(0);
  });

  it('la higiene del documento deja una aparición (petitorios) y marca apartados vacíos', () => {
    const paragraph = 'PRIMERO. Tenerme por presentado en tiempo y forma promoviendo el presente escrito y admitirlo a trámite en los términos solicitados.';
    const doc = {
      sections: [
        { id: 'a', title: 'OBJETO', type: 'custom', content: [{ id: 'b1', text: paragraph }] },
        { id: 'p', title: 'PUNTOS PETITORIOS', type: 'petition', content: [{ id: 'b2', text: paragraph }] },
      ],
    };
    enforceOutputHygiene(doc);
    expect(doc.sections[1].content[0].text).toBe(paragraph);
    expect(doc.sections[0].content[0].text).toMatch(/^\[DATO PENDIENTE: apartado «OBJETO»/);
  });
});

// ───────────────────────── IA simulada hostil a través del pipeline ─────────────────────────

const REPEATED = 'La parte actora sostiene su pretensión en el contrato celebrado entre las partes y en las constancias que obran en el expediente, cuya valoración corresponde a este órgano jurisdiccional.';

function hostileModelOutput(title: string): string {
  return [
    `DESARROLLO DE BLOQUE: ${title}`,
    'OBJETIVO DEL BLOQUE: redactar la sección con rigor.',
    'Aquí tienes el texto solicitado.',
    'Modelo: nvidia/nemotron-3-super-120b-a12b',
    '```json\n{"blockId":"b-1","sectionId":"s-1"}\n```',
    'Conforme a la tesis de jurisprudencia con registro digital 2099887, la acción procede en términos del artículo 4321 del Código Civil del Estado de Jalisco.',
    'Está plenamente acreditado que la parte contraria incumplió el contrato.',
    REPEATED,
    REPEATED,
  ].join('\n\n');
}

function syntheticSource(declared: string) {
  return createSourceDocument({
    id: 'src-hostil', filename: 'fuente.txt', content: 'ACUERDO DE PRUEBAS Y RESOLUCIÓN QUE DA ORIGEN AL ESCRITO.',
    sourceValidated: true,
    classification: { sourceDocumentType: declared, role: 'PRIMARY', provenance: 'KNOWN_PROVENANCE' },
  } as never);
}

const analysis = () => ({
  parties: { actor: 'ACTOR SINTETICO', demandado: 'DEMANDADO SINTETICO' }, authorities: ['AUTORIDAD COMPETENTE SINTETICA'],
  caseNumbers: { principal: 'EXP-SINT-2026/001' },
  proceduralTimeline: [{ date: '2026-01-15', event: 'Actuación inicial que origina el escrito', sourceDocument: 'src-hostil', certainty: 1 }],
  challengedActs: [], claims: ['Pretensión que la parte promovente sostiene'], claimResponses: [], arguments: [],
  evidence: [{ id: 'ev-1', type: 'DOCUMENTAL', description: 'Constancia documental aportada', confirmed: true, provenance: 'LAWYER_CONFIRMED' }],
  facts: [{ id: 'f-1', number: '1', text: 'Hecho verificable que consta en el expediente.', confidence: 1 }],
}) as never;

async function generate(documentType: string, generateSection?: (input: { section: { title: string } }) => Promise<string>) {
  const identity = resolveWritingType(documentType);
  const declared = identity.compatibleSources.acceptedSourceTypes[0] || (identity.compatibleSources.optionalSourceTypes || [])[0] || 'SENTENCIA_O_RESOLUCION';
  const instruction = `Promover ${documentType}.`;
  const doc = await runGenerationPipeline({
    selectedDocumentType: documentType, documentTypeLabel: identity.label, matter: 'Civil', jurisdiction: 'Jalisco',
    userInstruction: instruction, sourceDocuments: [syntheticSource(declared)], caseAnalysis: analysis(),
    workflow: { flow: 'DOCUMENT_ANALYSIS', selection: { mode: 'automatic' }, updatedAt: new Date().toISOString() },
    ...(generateSection ? { generateSection } : {}),
  } as never);
  return { doc, instruction };
}

const allText = (doc: any) => doc.sections.flatMap((section: any) => (section.content || []).map((block: any) => block.text || '')).join('\n');

describe('respuestas de IA simuladas hostiles', () => {
  for (const documentType of ['apelacion_civil', 'contestacion_demanda_civil']) {
    it(`${documentType}: se neutraliza o se detecta lo que la IA intenta colar`, async () => {
      const { doc, instruction } = await generate(documentType, async ({ section }) => hostileModelOutput(section.title));
      const text = allText(doc);

      // Andamiaje y fugas: eliminados.
      expect(text).not.toMatch(/DESARROLLO DE BLOQUE/i);
      expect(text).not.toMatch(/OBJETIVO DEL BLOQUE/i);
      expect(text).not.toMatch(/Aquí tienes el texto/i);
      expect(text).not.toMatch(/nemotron|nvidia\//i);
      expect(text.match(/[^\n]{0,80}("blockId"|```)[^\n]{0,80}/)?.[0] ?? '').toBe('');

      // Registro digital y artículo inventados: no pueden quedar como autoridad verificada.
      expect(text).not.toMatch(/registro digital 2099887(?![^\[]*\])/i);
      const unmarked = validateGeneratedText(text, contextFromDocument(doc as never, { instruction })).filter((finding) => finding.code === 'UNSUPPORTED_CITATION');
      expect(unmarked, JSON.stringify(unmarked.map((finding) => finding.detail)) + ' :: ' + (text.match(/[^\n]{0,120}4321[^\n]{0,160}/)?.[0] ?? '')).toEqual([]);

      // Alegación presentada como probada: neutralizada (marcada para verificar) o ausente.
      const proven = validateGeneratedText(text, contextFromDocument(doc as never, { instruction })).filter((finding) => finding.code === 'ALLEGATION_AS_PROVEN');
      expect(proven).toEqual([]);

      // Bloque repetido: una sola aparición en todo el documento.
      expect(text.split(REPEATED).length - 1).toBeLessThanOrEqual(1);

      // Salida rotulada como borrador, no definitiva.
      expect(doc.status).not.toBe('final');

      const result = validateGeneratedOutput(doc as never, contextFromDocument(doc as never, { instruction }));
      expect(result.blockers.map((finding) => `${finding.code}:${finding.excerpt.slice(0, 60)}`), 'bloqueos finales').toEqual([]);
    }, 120000);
  }
});

// ───────────────────────── todas las familias, sin proveedor ─────────────────────────

describe('salida determinista de cada familia documental', () => {
  it('no contiene andamiaje, citas sin respaldo ni bloques duplicados', async () => {
    const seen = new Set<string>();
    const samples = visibleWritingTypes().filter((type) => type.capabilities.draft && !seen.has(type.familyId) && seen.add(type.familyId));
    expect(samples.length).toBeGreaterThan(50);
    const failures: string[] = [];
    let generated = 0;
    for (const sample of samples) {
      try {
        const { doc, instruction } = await generate(sample.id);
        generated++;
        const result = validateGeneratedOutput(doc as never, contextFromDocument(doc as never, { instruction, confirmedFacts: ['EXP-SINT-2026/001', '2026-01-15'] }));
        for (const blocker of result.blockers) failures.push(`${sample.id}: ${blocker.code} «${blocker.excerpt}»`);
      } catch (error) {
        // Combinaciones fuente/materia no generables con la fuente genérica de esta prueba.
        if (!/SOURCE_DOCUMENT_INCOMPATIBLE|PROCEDURAL_VIABILITY_FAILED/.test((error as Error).message)) failures.push(`${sample.id}: THROW ${(error as Error).message.slice(0, 100)}`);
      }
    }
    expect(generated).toBeGreaterThanOrEqual(80);
    expect(failures).toEqual([]);
  }, 280000);
});

// ───────────────────────── sin hechos inventados bajo protesta ─────────────────────────

describe('el motor determinista no afirma hechos bajo protesta de decir verdad', () => {
  const source = readFileSync('lib/legal-engine/pipeline.ts', 'utf8');
  const builder = source.slice(source.indexOf('function buildDeterministicBlockText'), source.indexOf('function shouldMaterializeSourceBackedProceduralReference'));

  it('toda fórmula «BAJO PROTESTA DE DECIR VERDAD» es un encabezado de lista alimentada por la fuente', () => {
    const occurrences = [...builder.matchAll(/BAJO PROTESTA DE DECIR VERDAD[^`]*`/g)].map((match) => match[0]);
    expect(occurrences.length).toBeGreaterThan(0);
    for (const occurrence of occurrences) expect(occurrence, occurrence).toMatch(/:\\n\\n`$|:`$/);
  });

  it('desaparecieron las afirmaciones fabricadas de laudo firme, requerimiento y cumplimiento', () => {
    expect(builder).not.toMatch(/se dictó laudo o sentencia definitiva firme que condena/);
    expect(builder).not.toMatch(/este Tribunal Laboral formuló requerimiento de aclaración/);
    expect(builder).not.toMatch(/se ha dado puntual cumplimiento a lo ordenado/);
    expect(builder).not.toMatch(/DESARROLLO DE BLOQUE/);
  });
});
