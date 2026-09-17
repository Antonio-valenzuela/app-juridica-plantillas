import { describe, it, expect } from 'vitest';
import {
  evaluateSourceOutputCompatibility,
  inferSourceMatterForDocuments,
  inferSourceOutputType,
} from '@/lib/legal-engine/sourceOutputCompatibility';
import type { UploadedSourceDocument } from '@/lib/legal-engine/types';
import { createSourceDocument } from '@/lib/legal-engine/context';

function createDocFromText(text: string, id = 'test-doc'): UploadedSourceDocument {
  return createSourceDocument({
    id,
    filename: `${id}.pdf`,
    name: `${id}.pdf`,
    type: 'pdf',
    fileUrl: `blob:${id}`,
    extractedText: text,
    pages: [{ page: 1, text, chars: text.length }],
    sourceValidated: true,
    fileSizeBytes: 1024,
  } as any);
}

const AMPARO_DIRECTO_LABORAL_SYNTHETIC = [
  'PODER JUDICIAL DE LA FEDERACIÓN',
  '',
  'AMPARO DIRECTO:',
  '800/2024',
  '',
  'QUEJOSO:',
  'PERSONA DEMO',
  '',
  'MAGISTRADO PONENTE:',
  'PERSONA DEMO',
  '',
  'TRIBUNAL COLEGIADO DE CIRCUITO',
  'SECRETARIA: LIC. DEMO',
  '',
  'VISTO',
  'RESULTANDO',
  'PRIMERO. El juicio laboral de origen...',
  'La demanda laboral fue presentada...',
  'La contestación de la demanda negó...',
  'La réplica de la parte actora insistió...',
  'El laudo dictado por la Junta...',
  'Trabajador y patrón comparecieron...',
  '',
  'CONSIDERANDO',
  'RESOLUTIVOS',
].join('\n');

const REPLICA_REAL_SYNTHETIC = [
  'EXPEDIENTE LABORAL 123/2024',
  'JUNTA DE CONCILIACIÓN Y ARBITRAJE',
  '',
  'RÉPLICA A LA CONTESTACIÓN DE DEMANDA',
  '',
  'La parte actora, por conducto de su apoderado, en tiempo y forma viene a dar réplica...',
  'Se insiste en la procedencia de las prestaciones reclamadas...',
].join('\n');

const REPLICA_WITH_AMPARO_EXPEDIENTE_MENTION = [
  'RÉPLICA A LA CONTESTACIÓN DE DEMANDA',
  'AMPARO DIRECTO: 800/2024',
  'La parte actora controvierte los argumentos de la contestación.',
].join('\n');

describe('RED: Amparo Directo vs Replica precedence', () => {
  it('SENTENCIA AMPARO DIRECTO con materia laboral y palabras réplica/contestación en cuerpo no debe ser REPLICA', () => {
    const doc = createDocFromText(AMPARO_DIRECTO_LABORAL_SYNTHETIC, 'amparo-directo-800');
    const inferred = inferSourceOutputType([doc]);

    // RED antes del fix: inferred === 'REPLICA' (incorrecto)
    // GREEN esperado: SENTENCIA_AMPARO_DIRECTO (materia LABORAL preservada vía corpus, tipo separado)
    expect(inferred).toBe('SENTENCIA_AMPARO_DIRECTO');
    // Verifica que el corpus sí contiene laboral pero el tipo no colapsa a REPLICA
    expect((doc.extractedText || '').toLowerCase()).toContain('laboral');
    expect((doc.extractedText || '').toLowerCase()).toContain('réplica');
  });

  it('REPLICA laboral real debe seguir siendo REPLICA', () => {
    const doc = createDocFromText(REPLICA_REAL_SYNTHETIC, 'replica-real');
    const inferred = inferSourceOutputType([doc]);

    expect(inferred).toBe('REPLICA');
    // sourceDocumentMatter('REPLICA') es NO_IDENTIFICADA por diseño (tipo genérico);
    // la materia LABORAL se infiere vía corpus en inferSourceMatter/evaluateSourceOutputCompatibility,
    // no vía sourceDocumentMatter directo. Verificamos que el corpus sí contiene laboral.
    expect((doc.extractedText || '').toLowerCase()).toContain('laboral');
  });

  it('una réplica que sólo menciona el expediente de amparo no se clasifica como sentencia', () => {
    const doc = createDocFromText(REPLICA_WITH_AMPARO_EXPEDIENTE_MENTION, 'replica-amparo-mention');
    expect(inferSourceOutputType([doc])).toBe('REPLICA');
  });

  it('una réplica que menciona la sentencia recurrida conserva su tipo de escrito', () => {
    const doc = createDocFromText([
      'RÉPLICA A LA CONTESTACIÓN DE DEMANDA',
      'AMPARO DIRECTO: 800/2024',
      'La parte actora controvierte la sentencia recurrida.',
    ].join('\n'), 'replica-sentence-mention');
    expect(inferSourceOutputType([doc])).toBe('REPLICA');
  });

  it('compatibility: SENTENCIA_AMPARO_DIRECTO (LABORAL) es compatible con recurso_revision_amparo_directo', () => {
    const doc = createDocFromText(AMPARO_DIRECTO_LABORAL_SYNTHETIC, 'amparo-directo-800');
    // Primero verifica que inferencia sea correcta (depende de fix anterior)
    const inferred = inferSourceOutputType([doc]);
    expect(inferred).toBe('SENTENCIA_AMPARO_DIRECTO');

    const result = evaluateSourceOutputCompatibility({
      selectedDocumentType: 'recurso_revision_amparo_directo',
      sourceDocuments: [doc],
    });
    expect(result.status).toBe('COMPATIBLE');
  });

  it('la materia sustantiva laboral se conserva aunque el tipo documental sea amparo directo', () => {
    const doc = createDocFromText(AMPARO_DIRECTO_LABORAL_SYNTHETIC, 'amparo-directo-800');

    expect(inferSourceMatterForDocuments([doc])).toBe('LABORAL');
    expect(evaluateSourceOutputCompatibility({
      selectedDocumentType: 'recurso_revision_amparo_directo',
      sourceDocuments: [doc],
    }).sourceMatter).toBe('LABORAL');
  });

  it('compatibility: REPLICA no debe ser forzada como compatible con recurso_revision_amparo_directo', () => {
    const doc = createDocFromText(REPLICA_REAL_SYNTHETIC, 'replica-real');
    const inferred = inferSourceOutputType([doc]);
    expect(inferred).toBe('REPLICA');

    // REPLICA no está en los acceptedSourceTypes de recurso_revision_amparo_directo (solo SENTENCIA_AMPARO_DIRECTO)
    expect(() => evaluateSourceOutputCompatibility({
      selectedDocumentType: 'recurso_revision_amparo_directo',
      sourceDocuments: [doc],
    })).toThrow(/SOURCE_DOCUMENT_INCOMPATIBLE/);
  });
});
