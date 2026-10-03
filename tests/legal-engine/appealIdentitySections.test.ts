import { describe, expect, it } from 'vitest';
import { generateLegalBlock } from '@/lib/legal-engine/pipeline';
import { createEmptyDocument } from '@/lib/legal-engine/types';
import { normalizeTitleKey } from '@/lib/legal-engine/documentPlan';
import { DEFAULT_LAWYER_PROFILE } from '@/lib/workspace/lawyerProfileTypes';
import type { LegalBlock } from '@/lib/legal-engine/blockPlanner';

const appealDocument = () => {
  const doc = createEmptyDocument({
    id: 'apelacion-proemio', documentType: 'apelacion_civil', documentTypeLabel: 'recurso de apelación civil',
    matter: 'civil', jurisdiction: 'local civil', flow: 'DOCUMENT_ANALYSIS',
  });
  doc.caseRefs = { ...doc.caseRefs, expediente: '1152/2013' };
  doc.parties = {
    ...doc.parties,
    actor: 'JUAN PÉREZ SÁNCHEZ',
    demandado: 'CONSTRUCTORA DEL VALLE, S.A. DE C.V.',
    autoridadDestinataria: 'JUEZ DE PRIMERA INSTANCIA DEL DISTRITO JUDICIAL DE ZAPOPAN',
  };
  return doc;
};

const identityBlock = (title: string, id: string): LegalBlock => ({
  id,
  kind: 'identity',
  sectionType: 'identity',
  title,
  level: 1,
  order: 1,
  text: '',
  sourceElementIndices: [],
  pages: { start: 1, end: 1 },
  aiNeed: 'PRESERVE_DIRECT',
  requiresAi: false,
classificationReason: 'fixture offline',
  elementCount: 1,
  charCount: 10,
} as unknown as LegalBlock);

async function renderIdentity(title: string, id: string) {
  const doc = appealDocument();
  const result = await generateLegalBlock(
    identityBlock(title, id), doc, {} as any, undefined, undefined, undefined, DEFAULT_LAWYER_PROFILE, undefined, undefined,
  );
  return result.text;
}

describe('cada sección de identidad cumple una función distinta', () => {
  it('PROEMIO, IDENTIFICACIÓN DEL ASUNTO y COMPARECENCIA Y PERSONALIDAD no comparten texto', async () => {
    const [proemio, asunto, comparecencia] = await Promise.all([
      renderIdentity('PROEMIO', 'sec-apelacion-proemio'),
      renderIdentity('IDENTIFICACIÓN DEL ASUNTO', 'sec-apelacion-asunto'),
      renderIdentity('COMPARECENCIA Y PERSONALIDAD', 'sec-apelacion-comparecencia'),
    ]);

    expect(new Set([proemio.trim(), asunto.trim(), comparecencia.trim()]).size).toBe(3);
    // La repetición del mismo párrafo en tres encabezados distintos era la
    // regresión visible del documento de 3 páginas.
    expect(proemio).not.toBe(asunto);
    expect(proemio).not.toBe(comparecencia);
    expect(asunto).not.toBe(comparecencia);
  });

  it('IDENTIFICACIÓN DEL ASUNTO fija expediente y tipo de promoción, no comparecencia', async () => {
    const asunto = await renderIdentity('IDENTIFICACIÓN DEL ASUNTO', 'sec-apelacion-asunto');
    expect(asunto).toContain('1152/2013');
    expect(asunto.toLowerCase()).toContain('apelaci');
    expect(asunto).not.toContain('comparezco a exponer');
  });

  it('COMPARECENCIA Y PERSONALIDAD identifica compareciente y carácter, no el objeto del escrito', async () => {
    const comparecencia = await renderIdentity('COMPARECENCIA Y PERSONALIDAD', 'sec-apelacion-comparecencia');
    expect(comparecencia).toContain('JUAN PÉREZ SÁNCHEZ');
    expect(comparecencia.toLowerCase()).toContain('personalidad');
    expect(comparecencia).not.toContain('1152/2013');
  });

  it('PROEMIO enuncia el propósito del escrito y no se confunde con la comparecencia', async () => {
    const proemio = await renderIdentity('PROEMIO', 'sec-apelacion-proemio');
    expect(proemio).not.toContain('comparezco a exponer');
    expect(proemio.trim().length).toBeGreaterThan(20);
  });

  it('un título de identidad desconocido degrada a una marca de pendiente, no a un duplicado', async () => {
    const desconocido = await renderIdentity('SECCION FORMAL NO CLASIFICADA', 'sec-apelacion-x');
    const proemio = await renderIdentity('PROEMIO', 'sec-apelacion-proemio');
    expect(desconocido).not.toBe(proemio);
    expect(normalizeTitleKey('SECCION FORMAL NO CLASIFICADA')).toBe('seccion formal no clasificada');
  });
});