import { describe, expect, it } from 'vitest';
import { classifyIntent } from '../../lib/legal-engine/classifier';
import { buildStructure, extractMachoteStructure, extractIntegrityFields } from '../../lib/legal-engine/structureBuilder';
import { runGenerationPipeline } from '../../lib/legal-engine/pipeline';
import { 
  extractDocumentFullText, 
  extractDocumentIntegrityMap, 
  compareDocumentIntegrity, 
  verifyNoSensitiveAlteration, 
  hasCriticalContentLost 
} from '../../lib/legal-engine/integrityComparator';
import { validateDocument } from '../../lib/legal-engine/validator';
import { createEmptyDocument, createDocumentNode, UploadedSourceDocument } from '../../lib/legal-engine/types';
import { createSourceDocument } from '../../lib/legal-engine/context';

const CANARY_EXPEDIENTE = 'EXP_CANARIO_55441';
const NUMERIC_CANARY_EXPEDIENTE = '55441/2026';
const CANARY_CLIENTE = 'CLIENTE_CANARIO_92831';
const UPDATED_CANARY_CLIENTE = 'CLIENTE_CANARIO_92831_ACTUALIZADO';

describe('FASE 4: HARDENING, QA DE PRODUCCIÓN Y VALIDACIÓN INTEGRAL', () => {

  // =========================================================================
  // FASE C — MATRIZ DE PRUEBAS FUNCIONALES (14 PRESETS)
  // =========================================================================
  describe('Fase C — Matriz de Presets Reales', () => {
    const PRESETS = [
      // Demandas
      { name: 'Demanda Laboral Inicial', prompt: 'Demanda ordinaria laboral por despido injustificado reclamando indemnización', expectedMatter: 'laboral' },
      { name: 'Demanda Mercantil Ejecutiva', prompt: 'Demanda ejecutiva mercantil fundada en pagaré o título de crédito', expectedMatter: 'general' },
      { name: 'Demanda Civil Ordinaria', prompt: 'Demanda ordinaria civil por incumplimiento de contrato', expectedMatter: 'general' },
      { name: 'Demanda de Amparo Directo', prompt: 'Demanda de amparo directo contra sentencia definitiva', expectedMatter: 'constitucional' },
      { name: 'Demanda de Amparo Indirecto', prompt: 'Demanda de amparo indirecto contra acto de autoridad', expectedMatter: 'constitucional' },
      // Contestaciones
      { name: 'Contestación Laboral', prompt: 'Contestación a la demanda laboral negando el despido', expectedMatter: 'laboral' },
      { name: 'Contestación Civil / Mercantil', prompt: 'Contestación de demanda civil y excepciones', expectedMatter: 'civil' },
      // Recursos
      { name: 'Recurso de Revisión', prompt: 'Interponer recurso de revisión contra la sentencia recurrida', expectedMatter: 'general' },
      { name: 'Recurso de Revisión en Amparo', prompt: 'Recurso de revisión en amparo directo ante la SCJN', expectedMatter: 'constitucional' },
      { name: 'Recurso de Queja', prompt: 'Recurso de queja contra auto que desecha la demanda', expectedMatter: 'general' },
      { name: 'Recurso de Reclamación', prompt: 'Recurso de reclamación contra acuerdo de presidencia', expectedMatter: 'general' },
      { name: 'Expresión de Agravios', prompt: 'Escrito de expresión de agravios en apelación', expectedMatter: 'general' },
      // Otros
      { name: 'Incidente de Nulidad / Procesal', prompt: 'Incidente de nulidad de actuaciones por falta de emplazamiento', expectedMatter: 'general' },
      { name: 'Escrito de Cumplimiento', prompt: 'Escrito de cumplimiento de sentencia o requerimiento judicial', expectedMatter: 'general' },
    ];

    for (const preset of PRESETS) {
      it(`debe clasificar, estructurar y generar coherentemente: ${preset.name}`, async () => {
        const classification = classifyIntent(preset.prompt);
        expect(classification.documentType).toBeDefined();
        expect(classification.documentType).not.toBe('unknown');

        const doc = await runGenerationPipeline({
          ...((preset.name === 'Demanda Mercantil Ejecutiva' || preset.name === 'Demanda Civil Ordinaria')
            ? { selectedDocumentType: 'demanda' }
            : {}),
          userInstruction: preset.prompt,
          documentTypeLabel: preset.name,
          matter: preset.expectedMatter,
        });

        expect(doc.id).toBeDefined();
        expect(doc.title).toContain(
          preset.name === 'Demanda Mercantil Ejecutiva' || preset.name === 'Demanda Civil Ordinaria'
            ? 'Demanda'
            : preset.name,
        );
        expect(doc.sections.length).toBeGreaterThanOrEqual(4);
        expect(doc.sections.some(s => s.type === 'petition' || s.title.toLowerCase().includes('petitorio'))).toBe(true);

        const validation = validateDocument(doc);
        expect(validation.isValid).toBe(true);
        expect(validation.errors).toHaveLength(0);
      });
    }
  });

  // =========================================================================
  // FASE D — PRUEBAS CON MACHOTES REALES (CORTO, ESTRUCTURADO, IRREGULAR)
  // =========================================================================
  describe('Fase D — Pruebas con Machotes Reales', () => {
    it('Caso 1: Machote corto (1-2 párrafos) se procesa y conserva su información', async () => {
      const shortMachote = `EXPEDIENTE: 450/2023\nJUZGADO TERCERO DE DISTRITO\nComparezco a solicitar copias certificadas del acuerdo.\nPROTESTO LO NECESARIO.`;
      
      const doc = await runGenerationPipeline({
        userInstruction: 'Solicitar copias certificadas',
        referenceDocumentText: shortMachote,
      });

      expect(doc.sections.length).toBeGreaterThan(0);
      const fullText = extractDocumentFullText(doc);
      expect(fullText).toContain('450/2023');
    });

    it('Caso 2: Machote estructurado conserva orden y jerarquía de secciones', async () => {
      const structuredMachote = `
        EXPEDIENTE: ${CANARY_EXPEDIENTE}
        H. SEGUNDO TRIBUNAL COLEGIADO EN MATERIA DE TRABAJO DEL TERCER CIRCUITO
        PROEMIO
        Comparezco en representación de ${CANARY_CLIENTE}.
        ANTECEDENTES
        1. En fecha 10 de marzo de 2023 se emitió laudo.
        AGRAVIOS
        PRIMERO. Violación al principio de exhaustividad y congruencia.
        PRUEBAS
        1. Instrumental de actuaciones.
        PETITORIOS
        PRIMERO.- Tenerme por presentado en tiempo y forma.
        PROTESTO LO NECESARIO.
        FIRMA DEL QUEJOSO
      `;

      const nodes = extractMachoteStructure(structuredMachote);
      expect(nodes.length).toBeGreaterThanOrEqual(6);
      
      const titles = nodes.map(n => n.title);
      expect(titles.some(t => t.includes('PROEMIO'))).toBe(true);
      expect(titles.some(t => t.includes('ANTECEDENTES'))).toBe(true);
      expect(titles.some(t => t.includes('AGRAVIOS'))).toBe(true);
      expect(titles.some(t => t.includes('PETITORIOS'))).toBe(true);
    });

    it('Caso 3: Machote irregular con encabezados atípicos no se rompe', async () => {
      const irregularMachote = `
        *** ASUNTO URGENTE ***
        DIRIGIDO A: SALA REGIONAL DEL TRIBUNAL
        EXP: 9999/2024
        --- CAPITULO UNICO ---
        Exponemos los motivos de inconformidad sin numeración tradicional.
        Por lo expuesto:
        Pido justicia y resolución favorable.
      `;

      const doc = await runGenerationPipeline({
        userInstruction: 'Procesar machote irregular',
        referenceDocumentText: irregularMachote,
      });

      expect(doc.sections.length).toBeGreaterThan(0);
      expect(doc.status).toBe('draft');
    });
  });

  // =========================================================================
  // FASE E — ATAQUES Y CASOS NEGATIVOS
  // =========================================================================
  describe('Fase E — Casos Negativos y Entradas Problemáticas', () => {
    it('Caso 1 & 2: Texto vacío o de una sola línea', async () => {
      const docEmpty = await runGenerationPipeline({ userInstruction: '' });
      expect(docEmpty.status).toBe('draft');

      const docOneLine = await runGenerationPipeline({ userInstruction: 'hola' });
      expect(docOneLine.status).toBe('draft');
    });

    it('Caso 3: Solo caracteres de puntuación/exclamación', async () => {
      const docPunct = await runGenerationPipeline({ userInstruction: '!!!!!!!' });
      expect(docPunct.status).toBe('draft');
    });

    it('Caso 4: Caracteres Unicode extraños o emojis', async () => {
      const docUnicode = await runGenerationPipeline({ userInstruction: '⚖️ Juicio laboral 🚀 👨‍⚖️ § ¶ ‰ € ¥ Ѫ 𝔄𝔅𝔆' });
      expect(docUnicode.status).toBe('draft');
      expect(docUnicode.sections.length).toBeGreaterThan(0);
    });

    it('Caso 5: Documento extremadamente largo', async () => {
      const hugeText = 'TEXTO DE EXPEDIENTE JURÍDICO EXTENSO. '.repeat(2000);
      const source = createSourceDocument({
        id: 'huge-doc',
        filename: 'extenso.txt',
        content: hugeText,
        sourceValidated: true,
      });

      const docHuge = await runGenerationPipeline({
        userInstruction: 'Resumir y contestar expediente largo',
        sourceDocuments: [source],
      });

      expect(docHuge.sections.length).toBeGreaterThan(0);
    }, 120000);

    it('Caso 6 & 7: Sin clasificación evidente o preset sin payload', async () => {
      const doc = await runGenerationPipeline({
        userInstruction: 'Quiero presentar un papel al gobierno',
      });
      expect(doc.classification.documentType).toBe('escrito_libre');
    });

    it('Caso 8: documentType desconocido cae a estructura segura', async () => {
      const doc = await runGenerationPipeline({
        userInstruction: 'Tipo raro',
        existingClassification: {
          documentType: 'tipo_desconocido_123',
          documentTypeLabel: 'Documento Desconocido',
          matter: 'general',
          jurisdiction: 'general',
          proceduralStage: 'cualquiera',
        },
      });

      expect(doc.sections.length).toBeGreaterThanOrEqual(4);
    });
  });

  // =========================================================================
  // FASE G & H — INTEGRIDAD JURÍDICA Y PRUEBAS DE MUTACIÓN
  // =========================================================================
  describe('Fase G & H — Integridad Jurídica y Mutaciones', () => {
    it('extrae campos de integridad sin confundir fechas con expedientes', () => {
      // Este extractor conserva el formato procesal numérico; el caso sintético no usa el expediente real.
      const sample = `México, a 15/08/2024. EXPEDIENTE: ${NUMERIC_CANARY_EXPEDIENTE}. SEGUNDO TRIBUNAL COLEGIADO EN MATERIA DE TRABAJO. AUTORIDAD RESPONSABLE: C. JUEZ PRIMERO.`;
      const fields = extractIntegrityFields(sample);

      expect(fields.expediente).toBe(NUMERIC_CANARY_EXPEDIENTE);
      expect(fields.fecha).toBe('15/08/2024');
      expect(fields.tribunal).toContain('SEGUNDO TRIBUNAL COLEGIADO');
      expect(fields.autoridad).toContain('C. JUEZ PRIMERO');
    });

    it('Test A: Mutación de nombre de actor autorizada', () => {
      const refDoc = createEmptyDocument({
        parties: { actor: CANARY_CLIENTE },
        caseRefs: { expediente: CANARY_EXPEDIENTE },
      });
      const genDoc = createEmptyDocument({
        parties: { actor: UPDATED_CANARY_CLIENTE },
        caseRefs: { expediente: CANARY_EXPEDIENTE },
      });

      const checkAuth = verifyNoSensitiveAlteration(refDoc, genDoc, `Cambiar el nombre del actor a ${UPDATED_CANARY_CLIENTE}`);
      expect(checkAuth.safe).toBe(true);
      expect(checkAuth.authorizedChanges.length).toBeGreaterThan(0);
      expect(checkAuth.alterations).toHaveLength(0);

      const checkUnauth = verifyNoSensitiveAlteration(refDoc, genDoc, 'Redactar conclusiones generales');
      expect(checkUnauth.safe).toBe(false);
      expect(checkUnauth.alterations.some(a => a.includes('actor'))).toBe(true);
    });

    it('Test C: Mutación de número de expediente detecta cambios no autorizados', () => {
      const refDoc = createEmptyDocument({ caseRefs: { expediente: CANARY_EXPEDIENTE } });
      const genDoc = createEmptyDocument({ caseRefs: { expediente: '999/2025' } });

      const check = verifyNoSensitiveAlteration(refDoc, genDoc, 'Redactar agravios');
      expect(check.safe).toBe(false);
      expect(check.alterations.some(a => a.includes('expediente'))).toBe(true);
    });
  });

  // =========================================================================
  // FASE I — PRUEBA DE CONTAMINACIÓN ENTRE DOCUMENTOS
  // =========================================================================
  describe('Fase I — Prevención de Contaminación Cruzada (Doc A -> Doc B -> Doc C)', () => {
    it('genera tres documentos sucesivos sin fuga de partes, expedientes ni hechos', async () => {
      // Documento A: Asunto laboral Juan Pérez
      const docA = await runGenerationPipeline({
        userInstruction: 'Contestar demanda laboral del actor JUAN PÉREZ en expediente 111/2023',
        matter: 'laboral',
      });

      // Documento B: Asunto mercantil Banco Azteca
      const docB = await runGenerationPipeline({
        selectedDocumentType: 'demanda',
        userInstruction: 'Demanda ejecutiva mercantil promovida por BANCO AZTECA en expediente 222/2024',
        matter: 'mercantil',
      });

      // Documento C: Asunto amparo María Gómez
      const docC = await runGenerationPipeline({
        userInstruction: 'Demanda de amparo indirecto promovida por MARÍA GÓMEZ en expediente 333/2025',
        matter: 'constitucional',
      });

      const textA = extractDocumentFullText(docA);
      const textB = extractDocumentFullText(docB);
      const textC = extractDocumentFullText(docC);

      // Doc B no debe tener datos de Doc A
      expect(textB).not.toContain('JUAN PÉREZ');
      expect(textB).not.toContain('111/2023');

      // Doc C no debe tener datos de Doc A ni de Doc B
      expect(textC).not.toContain('JUAN PÉREZ');
      expect(textC).not.toContain('111/2023');
      expect(textC).not.toContain('BANCO AZTECA');
      expect(textC).not.toContain('222/2024');

      // Tipos independientes
      expect(docA.matter).toBe('laboral');
      expect(docB.matter).toBe('mercantil');
      expect(docC.matter).toBe('constitucional');
    });
  });

  // =========================================================================
  // FASE N — MEMORIA Y ESTADO DEL DOCUMENTO
  // =========================================================================
  describe('Fase N — Aislamiento de Memoria y Ciclo de Vida', () => {
    it('createEmptyDocument genera instancias totalmente aisladas', () => {
      const doc1 = createEmptyDocument({ title: 'Doc 1' });
      const doc2 = createEmptyDocument({ title: 'Doc 2' });

      doc1.sections.push(createDocumentNode({ id: 's1', title: 'Sec 1' }));
      expect(doc2.sections).toHaveLength(0);

      doc1.parties.actor = 'Actor 1';
      expect(doc2.parties.actor).toBeUndefined();
    });
  });
});
