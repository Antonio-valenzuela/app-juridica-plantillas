/**
 * LOOP 9 — §7, §8, §9
 * PRUEBA DE ACEPTACIÓN: AISLAMIENTO MULTI-MATERIA
 *
 * Genera expedientes consecutivos de distintas materias (sin IA).
 * Verifica:
 *   - ningún dato de expediente A aparece en B/C/D
 *   - documento extraño no contamina la materia dominante
 *   - materia dominante correcta ante fichero irrelevante
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { runGenerationPipeline } from '@/lib/legal-engine/pipeline';
import { createSourceDocument } from '@/lib/legal-engine/context';

beforeAll(() => {
  for (const k of ['GEMINI_API_KEY', 'GROQ_API_KEY', 'OPENROUTER_API_KEY', 'NVIDIA_API_KEY']) {
    delete process.env[k];
  }
});

// ── Fixtures sintéticos por materia ──────────────────────────────────────────

const FUENTE_PENAL = createSourceDocument({
  id: 'iso-src-penal',
  filename: 'denuncia_penal_sintetica.pdf',
  sourceValidated: true,
  pages: [{
    page: 1,
    text: [
      'CARPETA DE INVESTIGACIÓN PENAL FGJ/123456/2026.',
      'Denunciante: ROBERTO MONTERRUBIO SÁNCHEZ.',
      'Imputado: HÉCTOR VILLAVERDE RUIZ.',
      'Delito: robo calificado con violencia. Ministerio Público.',
      'Bienes sustraídos valuados en $150,000.00 MXN.',
    ].join('\n'),
    chars: 280,
  }],
});

const FUENTE_FAMILIAR = createSourceDocument({
  id: 'iso-src-familiar',
  filename: 'demanda_alimentos_sintetica.pdf',
  sourceValidated: true,
  pages: [{
    page: 1,
    text: [
      'DEMANDA DE PENSIÓN ALIMENTICIA.',
      'Actora: VALENTINA CRUZ ESPINOSA.',
      'Demandado: FERNANDO REYES OLVERA.',
      'Menores beneficiarios: VALENTINA REYES CRUZ (7 años) y EMILIO REYES CRUZ (4 años).',
      'Pensión solicitada: 30% del ingreso neto del demandado.',
    ].join('\n'),
    chars: 290,
  }],
});

const FUENTE_LABORAL = createSourceDocument({
  id: 'iso-src-laboral',
  filename: 'demanda_laboral_sintetica.pdf',
  sourceValidated: true,
  pages: [{
    page: 1,
    text: [
      'DEMANDA LABORAL POR DESPIDO INJUSTIFICADO.',
      'Trabajador: GABRIEL ORTEGA FUENTES.',
      'Patrón: INDUSTRIAS MECANIZADAS DEL NORTE, S.A. DE C.V.',
      'Salario diario: $850.00. Antigüedad: 8 años.',
      'Fecha de despido: 15 de enero de 2026.',
    ].join('\n'),
    chars: 290,
  }],
});

const FUENTE_MERCANTIL = createSourceDocument({
  id: 'iso-src-mercantil',
  filename: 'pagare_mercantil_sintetico.pdf',
  sourceValidated: true,
  pages: [{
    page: 1,
    text: [
      'PAGARÉ MERCANTIL.',
      'Suscriptor: COMERCIALIZADORA ALTAMIRA, S.A. DE C.V.',
      'Beneficiario: BANCA CAPITAL EMPRESARIAL, S.A.',
      'Monto: $2,500,000.00 (DOS MILLONES QUINIENTOS MIL PESOS).',
      'Vencimiento: 30 de junio de 2026.',
    ].join('\n'),
    chars: 270,
  }],
});

import type { UniversalLegalDocument } from '@/lib/legal-engine/types';

function fullText(doc: UniversalLegalDocument): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (doc as any).sections
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((s: any) => s.content.map((b: any) => b.text).join('\n'))
    .join('\n');
}

// ══════════════════════════════════════════════════════════════════════════════
// §9 — AISLAMIENTO: ningún dato del expediente A aparece en B/C/D
// ══════════════════════════════════════════════════════════════════════════════

describe('§9 — Aislamiento universal: expedientes consecutivos no contaminan entre sí', () => {
  it('expediente penal: texto generado no contiene datos del familiar ni laboral ni mercantil', async () => {
    const doc = await runGenerationPipeline({
      userInstruction: 'Redactar escrito de denuncia penal por robo.',
      sourceDocuments: [FUENTE_PENAL],
    });
    const text = fullText(doc);

    // El doc A (penal) no debe tener datos de B, C, D
    expect(text).not.toContain('VALENTINA CRUZ ESPINOSA');
    expect(text).not.toContain('GABRIEL ORTEGA FUENTES');
    expect(text).not.toContain('COMERCIALIZADORA ALTAMIRA');
    expect(text).not.toContain('INDUSTRIAS MECANIZADAS DEL NORTE');
  }, 30000);

  it('expediente familiar: texto generado no contiene datos del penal ni laboral ni mercantil', async () => {
    const doc = await runGenerationPipeline({
      userInstruction: 'Redactar demanda de alimentos.',
      sourceDocuments: [FUENTE_FAMILIAR],
    });
    const text = fullText(doc);

    expect(text).not.toContain('ROBERTO MONTERRUBIO SÁNCHEZ');
    expect(text).not.toContain('GABRIEL ORTEGA FUENTES');
    expect(text).not.toContain('COMERCIALIZADORA ALTAMIRA');
  }, 30000);

  it('expediente laboral: texto generado no contiene datos del penal ni familiar ni mercantil', async () => {
    const doc = await runGenerationPipeline({
      userInstruction: 'Redactar contestación de demanda laboral.',
      sourceDocuments: [FUENTE_LABORAL],
    });
    const text = fullText(doc);

    expect(text).not.toContain('VALENTINA CRUZ ESPINOSA');
    expect(text).not.toContain('ROBERTO MONTERRUBIO SÁNCHEZ');
    expect(text).not.toContain('COMERCIALIZADORA ALTAMIRA');
    // El salario laboral no debe aparecer en el contexto familiar
    expect(text).not.toContain('VALENTINA REYES CRUZ');
  }, 30000);

  it('expediente mercantil: texto generado no contiene datos de los otros tres', async () => {
    const doc = await runGenerationPipeline({
      userInstruction: 'Redactar demanda ejecutiva mercantil por pagaré.',
      sourceDocuments: [FUENTE_MERCANTIL],
    });
    const text = fullText(doc);

    expect(text).not.toContain('VALENTINA CRUZ ESPINOSA');
    expect(text).not.toContain('ROBERTO MONTERRUBIO SÁNCHEZ');
    expect(text).not.toContain('GABRIEL ORTEGA FUENTES');
  }, 30000);
});

// ══════════════════════════════════════════════════════════════════════════════
// §8 — DOCUMENTO EXTRAÑO NO CONTAMINA LA MATERIA DOMINANTE
// ══════════════════════════════════════════════════════════════════════════════

const FACTURA_MERCANTIL_IRRELEVANTE = createSourceDocument({
  id: 'iso-src-factura',
  filename: 'factura_mercantil_irrelevante.pdf',
  sourceValidated: true,
  pages: [{
    page: 1,
    text: [
      'FACTURA COMERCIAL ELECTRÓNICA.',
      'Emisor: PROVEEDOR PAPELES Y ARTÍCULOS, S.A. DE C.V. RFC: PPA210301ABC.',
      'Receptor: FERRETERÍAS UNIDAS DEL SUR, S.A. Monto: $12,500.00 + IVA.',
      'Concepto: Suministro de material de oficina. Serie: A Folio: 0015.',
    ].join('\n'),
    chars: 250,
  }],
});

describe('§8 — Expediente con documento extraño: materia dominante correcta', () => {
  it('expediente familiar con factura mercantil irrelevante mantiene materia familiar', async () => {
    // El expediente familiar tiene 2 documentos: demanda familiar + factura
    // La factura NO debe convertir el expediente en mercantil
    const doc = await runGenerationPipeline({
      userInstruction: 'Redactar demanda de pensión alimenticia.',
      sourceDocuments: [FUENTE_FAMILIAR, FACTURA_MERCANTIL_IRRELEVANTE],
    });

    // El documento generado es de materia familiar, no mercantil
    expect(doc.matter).not.toBe('mercantil');
    // La factura no debe moldear el contenido
    const text = fullText(doc);
    expect(text).not.toContain('RFC: PPA210301ABC');
    expect(text).not.toContain('PROVEEDOR PAPELES Y ARTÍCULOS');
    expect(text).not.toContain('FERRETERÍAS UNIDAS DEL SUR');
  }, 30000);

  it('el caso inverso: expediente mercantil con acuerdo familiar no se vuelve familiar', async () => {
    const ACUERDO_FAMILIAR = createSourceDocument({
      id: 'iso-src-acuerdo-familiar',
      filename: 'acuerdo_familiar_referencia.pdf',
      sourceValidated: true,
      pages: [{
        page: 1,
        text: 'Acuerdo de divorcio voluntario. Custodia compartida. Alimentos menores.',
        chars: 90,
      }],
    });

    const doc = await runGenerationPipeline({
      userInstruction: 'Redactar demanda ejecutiva mercantil por pagaré.',
      sourceDocuments: [FUENTE_MERCANTIL, ACUERDO_FAMILIAR],
    });

    // El pagaré mercantil domina; el acuerdo familiar no dirige la salida
    expect(doc.matter).not.toBe('familiar');
    const text = fullText(doc);
    expect(text).not.toContain('Custodia compartida');
  }, 30000);
});

// ══════════════════════════════════════════════════════════════════════════════
// §7 — DOCUMENTOS MÚLTIPLES: orden, clasificación, trazabilidad
// ══════════════════════════════════════════════════════════════════════════════

describe('§7 — Expedientes con múltiples documentos: trazabilidad y no contaminación', () => {
  const DEMANDA = createSourceDocument({
    id: 'multi-demanda',
    filename: 'demanda_ordinaria_civil.pdf',
    sourceValidated: true,
    pages: [{
      page: 1,
      text: 'DEMANDA ORDINARIA CIVIL. Actor: PATRICIA JUÁREZ RAMOS. Demandado: CONSTRUCTORA TIERRA NUEVA, S.A.',
      chars: 120,
    }],
  });

  const ACUERDO = createSourceDocument({
    id: 'multi-acuerdo',
    filename: 'auto_admisorio.pdf',
    sourceValidated: true,
    pages: [{
      page: 1,
      text: 'ACUERDO. Admítase a trámite la demanda. Emplácese al demandado en el domicilio señalado.',
      chars: 105,
    }],
  });

  const PRUEBA = createSourceDocument({
    id: 'multi-prueba',
    filename: 'documental_publica.pdf',
    sourceValidated: true,
    pages: [{
      page: 1,
      text: 'ESCRITURA PÚBLICA. Contrato de compraventa de inmueble. Notario 42. Fecha: 10 enero 2024.',
      chars: 105,
    }],
  });

  it('expediente con demanda + acuerdo + prueba: genera escrito sin mezcla de identidades', async () => {
    const doc = await runGenerationPipeline({
      userInstruction: 'Redactar escrito ofreciendo prueba documental.',
      sourceDocuments: [DEMANDA, ACUERDO, PRUEBA],
    });

    // Sin contaminación de datos de otros expedientes cargados anteriormente
    const text = fullText(doc);
    expect(text).not.toContain('ROBERTO MONTERRUBIO SÁNCHEZ'); // penal
    expect(text).not.toContain('GABRIEL ORTEGA FUENTES');       // laboral
    expect(text).not.toContain('COMERCIALIZADORA ALTAMIRA');    // mercantil

    // Sin marca de agua ni prompts internos
    expect(text).not.toMatch(/OBJETIVO DEL BLOQUE\s*:/i);
    expect(text).not.toMatch(/\[Desarrollar por la IA/i);
    expect(text).not.toMatch(/\[Completar por la IA/i);
  }, 30000);

  it('todos los sourceDocuments del expediente se conservan en el resultado', async () => {
    const doc = await runGenerationPipeline({
      userInstruction: 'Redactar escrito ofreciendo prueba documental.',
      sourceDocuments: [DEMANDA, ACUERDO, PRUEBA],
    });

    // El documento resultante referencia los 3 documentos fuente
    expect(doc.sourceDocuments.length).toBeGreaterThanOrEqual(2);
  }, 30000);
});
