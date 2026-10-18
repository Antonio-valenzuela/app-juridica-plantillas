/**
 * Fase 2 · Parte 1 — compatibilidad por ACTO procesal.
 *
 * Regla: actuación elegida × naturaleza real del acto × materia. Fixtures 100 %
 * sintéticos. Causa raíz reproducida: un PDF de varios actos se clasificaba con el
 * corpus completo y una sola foja con aspecto de demanda convertía todo el PDF en
 * DEMANDA_CIVIL, de modo que Apelación rechazaba una resolución.
 */
import { describe, expect, it } from 'vitest';
import { createSourceDocument } from '@/lib/legal-engine/context';
import {
  evaluateSourceOutputCompatibility,
  inferSourceOutputType,
} from '@/lib/legal-engine/sourceOutputCompatibility';
import { segmentProceduralActs } from '@/lib/legal-engine/proceduralActs';
import { describeIncompatibleSource, getGenerationErrorPresentation } from '@/lib/apiErrorMessage';
import { AUTO_FAMILIAR_DESECHA_INCIDENTE, autoFamiliarLargo } from '../fixtures/autoFamiliarSintetico';
import {
  ACUERDO_TRAMITE,
  CONTESTACION_SINTETICA,
  DEMANDA_FAMILIAR_SINTETICA,
  SENTENCIA_DEFINITIVA,
  autoDesechaIncidente,
  documentFromPages,
} from '../fixtures/actosProcesalesSinteticos';
import { sourceFromText } from '../helpers/syntheticCaseDocuments';

function evaluate(selected: string, ...sources: ReturnType<typeof sourceFromText>[]) {
  try {
    return { result: evaluateSourceOutputCompatibility({ selectedDocumentType: selected, sourceDocuments: sources }), error: null as null | { code?: string; message: string } };
  } catch (error) {
    return { result: null, error: { code: (error as { code?: string }).code, message: (error as Error).message } };
  }
}

describe('A–D: un solo acto × actuación elegida', () => {
  it('A. una demanda se contesta; no se apela', () => {
    const demanda = sourceFromText(DEMANDA_FAMILIAR_SINTETICA, 'demanda');
    expect(evaluate('contestacion_demanda_civil', demanda).result?.status).toBe('COMPATIBLE');
    expect(evaluate('apelacion_civil', demanda).error?.code).toBe('SOURCE_DOCUMENT_INCOMPATIBLE');
  });

  it('B. una sentencia definitiva se apela sin avisos de procedencia; no se contesta', () => {
    const sentencia = sourceFromText(SENTENCIA_DEFINITIVA, 'sentencia');
    const apelacion = evaluate('apelacion_familiar', sentencia).result;
    expect(apelacion?.status).toBe('COMPATIBLE');
    expect(apelacion?.controllingActs?.[0]).toMatchObject({ kind: 'SENTENCIA_DEFINITIVA' });
    expect(apelacion?.advisories?.some((advisory) => advisory.code === 'ACT_APPEALABILITY_CONFIRMATION')).toBeFalsy();
    expect(evaluate('contestacion_demanda_civil', sentencia).error?.code).toBe('SOURCE_DOCUMENT_INCOMPATIBLE');
  });

  it('C. un auto que resuelve un incidente se puede impugnar, pero pide confirmar la procedencia', () => {
    const auto = sourceFromText(AUTO_FAMILIAR_DESECHA_INCIDENTE, 'auto');
    const apelacion = evaluate('apelacion_familiar', auto).result;
    expect(apelacion?.status).toBe('COMPATIBLE');
    expect(apelacion?.controllingActs?.[0]).toMatchObject({ kind: 'AUTO_INTERLOCUTORIO', decidesIncident: true });
    expect(apelacion?.advisories?.map((advisory) => advisory.code)).toContain('ACT_APPEALABILITY_CONFIRMATION');
    // No es una demanda: no se puede contestar.
    expect(evaluate('contestacion_demanda_civil', auto).error?.code).toBe('SOURCE_DOCUMENT_INCOMPATIBLE');
  });

  it('C. un acuerdo de trámite es compatible con avisos de procedencia', () => {
    const acuerdo = sourceFromText(ACUERDO_TRAMITE, 'acuerdo');
    const result = evaluate('apelacion_civil', acuerdo).result;
    expect(result?.status).toBe('COMPATIBLE');
    expect(result?.controllingActs?.[0].kind).toBe('ACUERDO_TRAMITE');
    expect(result?.advisories?.map((advisory) => advisory.code)).toContain('ACT_APPEALABILITY_CONFIRMATION');
  });

  it('D. una contestación existente alimenta réplica pero no otra contestación', () => {
    const contestacion = sourceFromText(CONTESTACION_SINTETICA, 'contestacion');
    expect(evaluate('replica', contestacion).result?.status).toBe('COMPATIBLE');
    expect(evaluate('contestacion_demanda_civil', contestacion).error?.code).toBe('SOURCE_DOCUMENT_INCOMPATIBLE');
  });
});

describe('E. PDF con varios actos', () => {
  it('reproduce el caso reportado: auto familiar de 44 páginas + Apelación Civil ya no se rechaza', () => {
    const pdf = autoFamiliarLargo('caso-reportado', 44);
    // Antes del cambio: inferSourceOutputType → SENTENCIA_O_RESOLUCION solo si ninguna foja parecía demanda.
    const withDemandPage = documentFromPages('con-demanda', [AUTO_FAMILIAR_DESECHA_INCIDENTE, ...Array(41).fill('CONSTANCIA SECRETARIAL. Obran agregadas actuaciones.'), 'Demanda inicial agregada a los autos', 'CONSTANCIA.']);
    for (const source of [pdf, withDemandPage]) {
      for (const selected of ['apelacion_civil', 'apelacion_familiar']) {
        const { result, error } = evaluate(selected, source);
        expect(error, `${source.id}/${selected}`).toBeNull();
        expect(result?.status).toBe('COMPATIBLE');
        expect(result?.controllingActs?.[0]).toMatchObject({ startPage: 1 });
      }
    }
  });

  it('elige el acto objeto de la actuación y conserva sus páginas', () => {
    const pages = [
      DEMANDA_FAMILIAR_SINTETICA,
      'CONSTANCIA SECRETARIAL. Se agregó el emplazamiento.',
      CONTESTACION_SINTETICA,
      ACUERDO_TRAMITE,
      'CONSTANCIA. Notificación practicada.',
      SENTENCIA_DEFINITIVA,
    ];
    const pdf = documentFromPages('multiacto', pages);
    const acts = segmentProceduralActs(pdf.pages!).map((act) => [act.kind, act.startPage, act.endPage]);
    expect(acts).toEqual([
      ['DEMANDA', 1, 1], ['CONSTANCIA_O_ANEXO', 2, 2], ['CONTESTACION', 3, 3], ['ACUERDO_TRAMITE', 4, 4],
      ['CONSTANCIA_O_ANEXO', 5, 5], ['SENTENCIA_DEFINITIVA', 6, 6],
    ]);
    const apelacion = evaluate('apelacion_civil', pdf).result;
    expect(apelacion?.controllingActs?.[0]).toMatchObject({ kind: 'SENTENCIA_DEFINITIVA', startPage: 6, endPage: 6 });
    const contestacion = evaluate('contestacion_demanda_civil', pdf).result;
    expect(contestacion?.status).toBe('COMPATIBLE');
    expect(contestacion?.controllingActs?.[0]).toMatchObject({ kind: 'DEMANDA', startPage: 1, endPage: 1 });
    expect(contestacion?.controllingActs?.[0].actsInDocument).toHaveLength(6);
  });

  it('sin la demanda en el PDF, contestar sigue bloqueado y nombra el acto real', () => {
    const { error } = evaluate('contestacion_demanda_civil', autoFamiliarLargo('sin-demanda', 44));
    expect(error?.code).toBe('SOURCE_DOCUMENT_INCOMPATIBLE');
  });
});

describe('F. documento ambiguo', () => {
  it('queda para revisión; no se adivina un tipo', () => {
    const ambiguo = sourceFromText('Texto sin encabezado ni fórmula procesal reconocible. Notas varias.', 'ambiguo');
    const { result, error } = evaluate('apelacion_civil', ambiguo);
    expect(error).toBeNull();
    expect(result?.status).toBe('NEEDS_INPUT');
    expect(result?.code).toBe('SOURCE_TYPE_UNKNOWN');
  });
});

describe('Materia: el mismo acto contra tipos civil y familiar', () => {
  const civil = sourceFromText(autoDesechaIncidente('civil'), 'auto-civil');
  const familiar = sourceFromText(autoDesechaIncidente('familiar'), 'auto-familiar');
  const mercantil = sourceFromText(autoDesechaIncidente('mercantil'), 'auto-mercantil');
  const advisoryCodes = (selected: string, source: typeof civil) =>
    (evaluate(selected, source).result?.advisories || []).map((advisory) => advisory.code);

  it('acto civil: Apelación Civil sin aviso de materia; Apelación Familiar pide confirmar', () => {
    expect(evaluate('apelacion_civil', civil).result?.status).toBe('COMPATIBLE');
    expect(advisoryCodes('apelacion_civil', civil)).not.toContain('MATTER_PROCEDURAL_CODE_CONFIRMATION');
    expect(advisoryCodes('apelacion_familiar', civil)).toContain('MATTER_PROCEDURAL_CODE_CONFIRMATION');
  });

  it('acto familiar: Apelación Familiar sin aviso; Apelación Civil pide confirmar el código procesal (no bloquea ni cambia el tipo)', () => {
    expect(evaluate('apelacion_familiar', familiar).result?.status).toBe('COMPATIBLE');
    expect(advisoryCodes('apelacion_familiar', familiar)).not.toContain('MATTER_PROCEDURAL_CODE_CONFIRMATION');
    const civilOnFamily = evaluate('apelacion_civil', familiar).result;
    expect(civilOnFamily?.status).toBe('COMPATIBLE');
    expect(civilOnFamily?.selectedDocumentType).toBe('apelacion_civil');
    expect(civilOnFamily?.advisories?.find((advisory) => advisory.code === 'MATTER_PROCEDURAL_CODE_CONFIRMATION')?.message)
      .toMatch(/materia familiar[\s\S]*apelaci[oó]n civil/i);
  });

  it('una materia que el catálogo declara incompatible sigue bloqueando', () => {
    expect(evaluate('apelacion_civil', mercantil).error?.code).toBe('SOURCE_DOCUMENT_INCOMPATIBLE');
    expect(evaluate('apelacion_familiar', mercantil).error?.code).toBe('SOURCE_DOCUMENT_INCOMPATIBLE');
  });
});

describe('Clasificación global: ya no depende de una foja suelta', () => {
  it('una foja que empieza con «Demanda…» no convierte la resolución en demanda', () => {
    const pdf = documentFromPages('foja-suelta', [AUTO_FAMILIAR_DESECHA_INCIDENTE, 'CONSTANCIA.', 'Demanda inicial agregada a los autos', 'CONSTANCIA.']);
    expect(inferSourceOutputType([pdf])).toBe('SENTENCIA_O_RESOLUCION');
  });
});

describe('Mensaje según la actuación elegida', () => {
  const from = (selected: string, detected: string) => ({
    errorCode: 'SOURCE_DOCUMENT_INCOMPATIBLE',
    message: `SOURCE_DOCUMENT_INCOMPATIBLE El documento fuente detectado como ${detected} (FAMILIAR) no es compatible con ${selected}. Las fuentes aceptadas son: X.`,
  });

  it('una apelación nunca habla de contestación', () => {
    const message = getGenerationErrorPresentation(from('apelacion_civil', 'DEMANDA_CIVIL')).message;
    expect(message).toMatch(/Apelacion civil/i);
    expect(message).toMatch(/resolución que pueda impugnarse/);
    expect(message).not.toMatch(/contestaci[oó]n/i);
  });

  it('una contestación sí pide la demanda y reconoce que el documento parece una resolución', () => {
    const message = describeIncompatibleSource(from('contestacion_demanda_civil', 'SENTENCIA_O_RESOLUCION'));
    expect(message).toMatch(/requiere la demanda/);
    expect(message).toMatch(/parece una resolución/);
  });

  it('otros tipos reciben un mensaje genérico con el nombre del escrito elegido', () => {
    expect(describeIncompatibleSource(from('replica', 'SENTENCIA_O_RESOLUCION'))).toMatch(/no corresponde a Replica/);
  });
});
