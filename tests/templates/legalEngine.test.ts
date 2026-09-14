import { describe, it, expect } from 'vitest';
import { classifyIntent } from '../../lib/legal-engine/classifier';
import { buildStructure } from '../../lib/legal-engine/structureBuilder';
import { buildVariableMap, resolveText } from '../../lib/legal-engine/variableResolver';
import { validateDocument } from '../../lib/legal-engine/validator';
import { createEmptyDocument, createDocumentNode } from '../../lib/legal-engine/types';

const CANARY_EXPEDIENTE = 'EXP_CANARIO_55441';
const CANARY_CLIENTE = 'CLIENTE_CANARIO_92831';

describe('Universal Legal Engine', () => {
  it('should classify intent correctly for test cases A-F', () => {
    // Caso A: Laboral
    const resA = classifyIntent('Necesito una contestación de demanda laboral');
    expect(resA.documentType).toBe('contestacion_demanda_laboral');
    expect(resA.matter).toBe('laboral');

    // Caso B: Recursos administrativos
    const resB = classifyIntent('Necesito un recurso contra esta resolución administrativa');
    expect(resB.documentType).toBe('recurso_administrativo');

    // Caso C: Cumplimiento
    const resC = classifyIntent('Necesito un escrito para solicitar el cumplimiento de sentencia');
    expect(resC.documentType).toBe('escrito_cumplimiento_sentencia');

    // Caso D: Agravios
    const resD = classifyIntent('Hazme unos agravios contra esta resolución');
    expect(resD.documentType).toBe('escrito_agravios');

    // Caso E: Amparo
    const resE = classifyIntent('Necesito preparar un amparo indirecto');
    expect(resE.documentType).toBe('demanda_amparo_indirecto');

    // Caso F: Recurso de Revisión SCJN
    const resF = classifyIntent('Quiero interponer un Recurso de Revisión en Amparo Directo ante la SCJN');
    expect(resF.documentType).toBe('recurso_revision_amparo_directo');
    expect(resF.authority).toContain('Suprema Corte');
  });

  it('should build appropriate section structure for Recurso de Revisión SCJN', () => {
    const classification = classifyIntent('Recurso de Revisión en Amparo Directo ante SCJN');
    const sections = buildStructure(classification);

    expect(sections.length).toBeGreaterThanOrEqual(10);
    const titles = sections.map((s) => s.title);
    expect(titles).toContain('BLOQUE DE CONSTITUCIONALIDAD');
    expect(titles).toContain('INTERÉS EXCEPCIONAL');
    expect(titles).toContain('AGRAVIO PRIMERO');
    expect(titles).toContain('PETITORIOS');
  });

  it('should build dynamic structure for unknown prompt', () => {
    const classification = classifyIntent('Quiero pedir permiso al ayuntamiento para evento');
    const sections = buildStructure(classification);
    expect(sections.length).toBe(9);
  });

  it('should resolve variable placeholders correctly', () => {
    const variables = buildVariableMap(
      { actor: CANARY_CLIENTE },
      { expediente: CANARY_EXPEDIENTE }
    );

    const templateText = 'En el expediente {{EXPEDIENTE}}, comparece {{QUEJOSO}} proponiendo...';
    const resolved = resolveText(templateText, variables);

    expect(resolved).toBe(`En el expediente ${CANARY_EXPEDIENTE}, comparece ${CANARY_CLIENTE} proponiendo...`);
  });

  it('should validate document correctly and report missing content/petitions', () => {
    const classification = classifyIntent('Recurso de revisión');
    const doc = createEmptyDocument({
      title: 'Test Doc',
      documentType: 'recurso_revision_amparo_directo',
      documentTypeLabel: 'Recurso de Revisión',
      matter: 'constitucional',
      jurisdiction: 'federal',
      category: 'Amparo',
      legalBasis: ['Ley de Amparo'],
    });
    doc.classification = classification;

    const val1 = validateDocument(doc);
    expect(val1.canExport).toBe(false); // No sections with content

    // Add content and petition
    doc.sections = [
      createDocumentNode({
        id: 'sec-1',
        type: 'argument',
        title: 'AGRAVIO PRIMERO',
        order: 1,
        content: [{ id: 'b1', text: 'Texto largo del agravio primero de prueba con contenido relevante', layer: 'GENERATED_ARGUMENT', trustLevel: 'VERIFIED' }],
      }),
      createDocumentNode({
        id: 'sec-2',
        type: 'petition',
        title: 'PETITORIOS',
        order: 2,
        content: [{ id: 'b2', text: 'PRIMERO.- Tener por presentado este recurso.', layer: 'GENERATED_ARGUMENT', trustLevel: 'VERIFIED' }],
      }),
    ];

    const val2 = validateDocument(doc);
    expect(val2.canExport).toBe(true);
  });
});
