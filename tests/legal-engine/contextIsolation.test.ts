import { describe, it, expect, beforeEach } from 'vitest';
import { runGenerationPipeline } from '@/lib/legal-engine/pipeline';
import { createSourceDocument } from '@/lib/legal-engine/context';
import { buildFingerprint } from '@/lib/legal-engine/generationLock';
import { createGenerationJob, findActiveJobByFingerprint } from '@/lib/legal-engine/generationJobs';
import { DocumentTemplates } from '@/lib/legal-engine/documentTemplates';

const CANARY_EXPEDIENTE = 'EXP_CANARIO_55441';
const CANARY_CLIENTE = 'CLIENTE_CANARIO_92831';
const SOURCE_TEST_ID = 'SOURCE_TEST_001';

function laboralTaxonomy() {
  return {
    matter: 'laboral',
    matterCustom: null,
    jurisdiction: 'local',
    jurisdictionCustom: null,
    documentType: 'demanda',
    documentTypeCustom: null,
  };
}
function amparoTaxonomy() {
  return {
    matter: 'amparo',
    matterCustom: null,
    jurisdiction: 'federal',
    jurisdictionCustom: null,
    documentType: 'demanda_amparo_indirecto',
    documentTypeCustom: null,
  };
}
function contestacionTaxonomy() {
  return {
    matter: 'laboral',
    matterCustom: null,
    jurisdiction: 'local',
    jurisdictionCustom: null,
    documentType: 'contestacion_demanda_laboral',
    documentTypeCustom: null,
  };
}

describe(`P0 — Aislamiento de contexto (LAB-001/2026 vs ${CANARY_EXPEDIENTE})`, () => {
  it(`TEST 1 — Generar Amparo (${CANARY_EXPEDIENTE}) y luego Demanda Laboral (LAB-001/2026) no contamina`, async () => {
    const canarySource = createSourceDocument({
      id: SOURCE_TEST_ID,
      filename: `${SOURCE_TEST_ID}.pdf`,
      sourceValidated: true,
      pages: [{ page: 1, text: `EXPEDIENTE: ${CANARY_EXPEDIENTE} SUPREMA CORTE DE JUSTICIA DE LA NACIÓN ACTO RECLAMADO: ... quejoso: ${CANARY_CLIENTE} autoridad responsable: Autoridad ficticia`, chars: 500 }],
    });
    const amparoDoc = await runGenerationPipeline({
      userInstruction: `Formular Demanda de Amparo Indirecto en materia Amparo. Expediente: ${CANARY_EXPEDIENTE}. Quejoso: ${CANARY_CLIENTE}. Autoridad: Autoridad ficticia.`,
      sourceDocuments: [canarySource],
      taxonomy: amparoTaxonomy() as any,
      matter: 'Amparo',
      jurisdiction: 'Federal',
      documentTypeLabel: 'Demanda de Amparo Indirecto',
      expediente: CANARY_EXPEDIENTE,
      savedParties: [{ role: 'quejoso', name: CANARY_CLIENTE }, { role: 'autoridad', name: 'Autoridad ficticia' }],
      allowUnvalidatedSource: true,
    }, undefined);
    expect(amparoDoc.matter.toLowerCase()).toContain('amparo');
    // Ahora generar Laboral limpio
    const laboralDoc = await runGenerationPipeline({
      userInstruction: 'Formular Demanda en materia Laboral. Jurisdicción: Local. Expediente: LAB-001/2026. Promovente: Juan Pérez López. Demandado: Servicios Administrativos del Centro, S.A. de C.V. Hechos: despido injustificado ficticio. Pretensiones: reinstalación/indemnización y prestaciones.',
      sourceDocuments: [],
      taxonomy: laboralTaxonomy() as any,
      matter: 'Laboral',
      jurisdiction: 'Local',
      documentTypeLabel: 'Demanda',
      expediente: 'LAB-001/2026',
      savedParties: [{ role: 'actor', name: 'Juan Pérez López' }, { role: 'demandado', name: 'Servicios Administrativos del Centro, S.A. de C.V.' }],
      allowUnvalidatedSource: true,
    }, undefined);
    const laboralText = laboralDoc.sections.flatMap(s => s.content.map(b => b.text)).join('\n');
    expect(laboralDoc.matter.toLowerCase()).toContain('laboral');
    expect(laboralDoc.documentType.toLowerCase()).toContain('demanda');
    expect(laboralDoc.jurisdiction.toLowerCase()).toContain('local');
    expect(laboralText).toContain('Juan Pérez López');
    expect(laboralText).toContain('Servicios Administrativos del Centro');
    expect(laboralText).toContain('LAB-001/2026');
    expect(laboralText).not.toContain(CANARY_EXPEDIENTE);
    expect(laboralText).not.toContain('Suprema Corte de Justicia de la Nación');
    // No debe contener marcadores de amparo si es laboral
    expect(laboralDoc.validation.warnings.find((w: any) => w.checkId === 'LABORAL_AMparo_MARKERS')).toBeUndefined();
  });

  it('TEST 2 — Contestación y luego Demanda: Demanda no contiene estructura de Contestación', async () => {
    const contestDoc = await runGenerationPipeline({
      userInstruction: `Contestación de demanda laboral. Expediente: ${CANARY_EXPEDIENTE}. Demandado: Patron X. Actor: Trabajador Y.`,
      taxonomy: contestacionTaxonomy() as any,
      matter: 'Laboral',
      jurisdiction: 'Local',
      documentTypeLabel: 'Contestación de Demanda Laboral',
      expediente: CANARY_EXPEDIENTE,
      savedParties: [{ role: 'demandado', name: 'Patron X' }, { role: 'actor', name: 'Trabajador Y' }],
      allowUnvalidatedSource: true,
    }, undefined);
    expect(contestDoc.documentType).toContain('contestacion');
    const demandaDoc = await runGenerationPipeline({
      userInstruction: 'Formular Demanda en materia Laboral. Expediente: LAB-001/2026. Promovente: Juan Pérez López. Demandado: Servicios Administrativos...',
      taxonomy: laboralTaxonomy() as any,
      matter: 'Laboral',
      jurisdiction: 'Local',
      documentTypeLabel: 'Demanda',
      expediente: 'LAB-001/2026',
      savedParties: [{ role: 'actor', name: 'Juan Pérez López' }, { role: 'demandado', name: 'Servicios Administrativos del Centro, S.A. de C.V.' }],
      allowUnvalidatedSource: true,
    }, undefined);
    const t = demandaDoc.sections.flatMap(s => s.content.map(b => b.text)).join('\n');
    expect(demandaDoc.documentType.toLowerCase()).not.toContain('contestacion');
    expect(t).not.toContain('CONTESTACIÓN DE HECHOS');
    expect(t).not.toContain('CONTESTACIÓN DE PRESTACIONES');
    expect(t).not.toContain('EXCEPCIONES Y DEFENSAS');
    // Demanda laboral debe tener estructura de demanda, no contestación
    expect(demandaDoc.documentType).toBe('demanda');
    expect(DocumentTemplates[demandaDoc.documentType].estructura).toContain('ACCIONES Y PRETENSIONES');
  });

  it(`TEST 3 — Expediente ${CANARY_EXPEDIENTE} no aparece en LAB-001/2026`, async () => {
    const doc = await runGenerationPipeline({
      userInstruction: 'Formular Demanda en materia Laboral. Jurisdicción: Local. Expediente: LAB-001/2026. Promovente: Juan Pérez López.',
      taxonomy: laboralTaxonomy() as any,
      matter: 'Laboral',
      jurisdiction: 'Local',
      documentTypeLabel: 'Demanda',
      expediente: 'LAB-001/2026',
      savedParties: [{ role: 'actor', name: 'Juan Pérez López' }],
      allowUnvalidatedSource: true,
    }, undefined);
    const text = doc.sections.flatMap(s => s.content.map(b => b.text)).join('\n');
    expect(doc.caseRefs.expediente).toBe('LAB-001/2026');
    expect(text).toContain('LAB-001/2026');
    expect(text).not.toContain(CANARY_EXPEDIENTE);
  });

  it('TEST 4 — Materia Laboral + Tipo Demanda produce documentType=demanda y matter=laboral', async () => {
    const doc = await runGenerationPipeline({
      userInstruction: 'Formular Demanda en materia Laboral. Hechos: despido injustificado.',
      taxonomy: laboralTaxonomy() as any,
      matter: 'Laboral',
      jurisdiction: 'Local',
      documentTypeLabel: 'Demanda',
      savedParties: [{ role: 'actor', name: 'Juan Pérez López' }],
      allowUnvalidatedSource: true,
    }, undefined);
    expect(doc.matter.toLowerCase()).toBe('laboral');
    expect(doc.documentType).toBe('demanda');
    expect(doc.documentTypeLabel.toLowerCase()).toContain('demanda');
    expect(doc.jurisdiction.toLowerCase()).toBe('local');
  });

  it('TEST 5 — Dos jobs distintos no comparten sections', async () => {
    const job1 = createGenerationJob({ fingerprint: buildFingerprint({ sourceIds: ['a'], userInstruction: `Amparo ${CANARY_EXPEDIENTE}`, matter: 'amparo', documentTypeLabel: 'Demanda de Amparo Indirecto', expediente: CANARY_EXPEDIENTE, partiesHash: `quejoso:${CANARY_CLIENTE.toLowerCase()}` }), total: 0 });
    const job2 = createGenerationJob({ fingerprint: buildFingerprint({ sourceIds: ['b'], userInstruction: 'Demanda laboral LAB-001/2026', matter: 'laboral', documentTypeLabel: 'Demanda', expediente: 'LAB-001/2026', partiesHash: 'actor:juan' }), total: 0 });
    expect(job1.jobId).not.toBe(job2.jobId);
    expect(job1.fingerprint).not.toBe(job2.fingerprint);
    // FindActive should not return wrong job
    const found1 = findActiveJobByFingerprint(job1.fingerprint, null);
    const found2 = findActiveJobByFingerprint(job2.fingerprint, null);
    expect(found1?.jobId).toBe(job1.jobId);
    expect(found2?.jobId).toBe(job2.jobId);
  });

  it('TEST 6 — Cambiar pestaña no cambia contexto (matter/jurisdiction estables)', async () => {
    // Simula generar con taxonomy laboral, luego sin limpiar estado generar otra con misma taxonomy -> debe seguir laboral
    const docA = await runGenerationPipeline({
      userInstruction: 'Demanda laboral inicial',
      taxonomy: laboralTaxonomy() as any,
      matter: 'Laboral',
      jurisdiction: 'Local',
      documentTypeLabel: 'Demanda',
      savedParties: [{ role: 'actor', name: 'Juan Pérez López' }],
      allowUnvalidatedSource: true,
    }, undefined);
    const docB = await runGenerationPipeline({
      userInstruction: 'Demanda laboral segunda con mismo contexto',
      taxonomy: laboralTaxonomy() as any,
      matter: 'Laboral',
      jurisdiction: 'Local',
      documentTypeLabel: 'Demanda',
      savedParties: [{ role: 'actor', name: 'Juan Pérez López' }],
      allowUnvalidatedSource: true,
    }, undefined);
    expect(docB.matter.toLowerCase()).toBe('laboral');
    expect(docB.jurisdiction.toLowerCase()).toBe('local');
    expect(docB.documentType).toBe('demanda');
  });

  it('TEST 7 — Reload recupera solo job/documento actual (fingerprint aislado)', async () => {
    const fpLaboral = buildFingerprint({ sourceIds: [], userInstruction: 'Demanda laboral LAB-001/2026', matter: 'laboral', jurisdiction: 'local', documentType: 'demanda', documentTypeLabel: 'Demanda', expediente: 'LAB-001/2026', partiesHash: 'actor:juan perez' });
    const fpAmparo = buildFingerprint({ sourceIds: [], userInstruction: `Amparo ${CANARY_EXPEDIENTE}`, matter: 'amparo', jurisdiction: 'federal', documentType: 'demanda_amparo_indirecto', documentTypeLabel: 'Demanda de Amparo Indirecto', expediente: CANARY_EXPEDIENTE, partiesHash: `quejoso:${CANARY_CLIENTE.toLowerCase()}` });
    expect(fpLaboral).not.toBe(fpAmparo);
    const jobLaboral = createGenerationJob({ fingerprint: fpLaboral, total: 0 });
    const foundLaboral = findActiveJobByFingerprint(fpLaboral, null);
    const foundAmparo = findActiveJobByFingerprint(fpAmparo, null);
    expect(foundLaboral?.jobId).toBe(jobLaboral.jobId);
    expect(foundAmparo).toBeUndefined(); // no debe encontrar amparo cuando busca laboral
  });

  it('TEST 8 — Template anterior no se reutiliza automáticamente', async () => {
    const amparoDoc = await runGenerationPipeline({
      userInstruction: `Amparo indirecto ${CANARY_EXPEDIENTE}`,
      taxonomy: amparoTaxonomy() as any,
      matter: 'Amparo',
      jurisdiction: 'Federal',
      documentTypeLabel: 'Demanda de Amparo Indirecto',
      expediente: CANARY_EXPEDIENTE,
      savedParties: [{ role: 'quejoso', name: CANARY_CLIENTE }],
      allowUnvalidatedSource: true,
    }, undefined);
    expect(amparoDoc.templateId).toBe('demanda_amparo_indirecto');
    const laboralDoc = await runGenerationPipeline({
      userInstruction: 'Demanda laboral LAB-001/2026 despido',
      taxonomy: laboralTaxonomy() as any,
      matter: 'Laboral',
      jurisdiction: 'Local',
      documentTypeLabel: 'Demanda',
      expediente: 'LAB-001/2026',
      savedParties: [{ role: 'actor', name: 'Juan Pérez López' }],
      allowUnvalidatedSource: true,
    }, undefined);
    expect(laboralDoc.templateId).toBe('demanda');
    expect(laboralDoc.templateId).not.toBe(amparoDoc.templateId);
    expect(laboralDoc.documentType).not.toContain('amparo');
  });

  it('VALIDACIÓN: Laboral no contiene SCJN/quejoso/autoridad responsable/acto reclamado/medio de defensa si no fue proporcionado', async () => {
    const doc = await runGenerationPipeline({
      userInstruction: 'Formular Demanda en materia Laboral. Jurisdicción: Local. Expediente: LAB-001/2026. Promovente: Juan Pérez López. Demandado: Servicios Administrativos del Centro, S.A. de C.V. Hechos: despido injustificado.',
      taxonomy: laboralTaxonomy() as any,
      matter: 'Laboral',
      jurisdiction: 'Local',
      documentTypeLabel: 'Demanda',
      expediente: 'LAB-001/2026',
      savedParties: [{ role: 'actor', name: 'Juan Pérez López' }, { role: 'demandado', name: 'Servicios Administrativos del Centro, S.A. de C.V.' }],
      allowUnvalidatedSource: true,
    }, undefined);
    const text = doc.sections.flatMap(s => s.content.map(b => b.text)).join('\n');
    const fullDocText = [doc.title, doc.documentTypeLabel, doc.documentType, ...doc.sections.flatMap(s => [s.title, ...s.content.map(b => b.text)])].join('\n');
    // Debe contener datos correctos
    expect(text).toContain('Juan Pérez López');
    expect(text).toContain('Servicios Administrativos del Centro');
    expect(text).toContain('LAB-001/2026');
    expect(fullDocText.toLowerCase()).toContain('demanda');
    // No debe contener contaminación de amparo
    expect(text).not.toMatch(/Suprema Corte de Justicia de la Nación/i);
    expect(text).not.toContain(CANARY_EXPEDIENTE);
    expect(text).not.toMatch(/medio de defensa promovido/i);
    // Para laboral, no debe tener placeholders de quejoso si actor fue proporcionado
    // Pero sí puede tener placeholder genérico si falta dato, pero no debe decir "Nombre del quejoso" si es laboral
    if (text.includes('DATO PENDIENTE')) {
      expect(text).not.toMatch(/Nombre del quejoso/i);
    }
  });
});
