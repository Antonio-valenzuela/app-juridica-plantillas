/**
 * LOOP 9 — §11, §19, §20
 * PRUEBA DE ACEPTACIÓN: REUTILIZACIÓN DE PLANTILLAS Y RESTRICCIÓN DE MATERIA
 *
 * §11, §19: Ciclo de vida real de plantillas:
 *   CASO A: crear plantilla desde documento A con datos específicos
 *   CASO B: reutilizar plantilla con datos nuevos
 *   Verificar:
 *     - nombre A no aparece
 *     - expediente A no aparece
 *     - domicilio A no aparece
 *     - monto A no aparece
 *     - estructura se conserva
 *     - variables nuevas de B se utilizan
 *
 * §20: Restricción de plantillas por materia:
 *   Plantilla familiar + caso mercantil → incompatible / bloqueada de uso primario.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { prepareExplicitTemplate } from '@/lib/legal-engine/context';
import { analyzePersonalTemplateText } from '@/lib/templates/personalTemplateBuilder';
import { rankTemplateCandidates } from '@/lib/templates/templateCompatibility';
import { runGenerationPipeline } from '@/lib/legal-engine/pipeline';
import { evaluateSourceOutputCompatibility, SOURCE_DOCUMENT_INCOMPATIBLE } from '@/lib/legal-engine/sourceOutputCompatibility';
import { createSourceDocument } from '@/lib/legal-engine/context';

beforeAll(() => {
  for (const k of ['GEMINI_API_KEY', 'GROQ_API_KEY', 'OPENROUTER_API_KEY', 'NVIDIA_API_KEY']) {
    delete process.env[k];
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// §11, §19 — CICLO COMPLETO: CASO A → PLANTILLA → CASO B
// ══════════════════════════════════════════════════════════════════════════════

describe('§11, §19 — Reutilización de plantillas: Caso A → Plantilla → Caso B', () => {
  const CANARIO_ACTOR_A = 'PERSONA_CANARIO_ALPHA_991';
  const CANARIO_DEMANDADO_A = 'PERSONA_CANARIO_BETA_882';
  const CANARIO_EXPEDIENTE_A = 'EXP-CANARIO-CIVIL-2026-773';
  const CANARIO_DOMICILIO_A = 'AVENIDA_CANARIO_INSURGENTES_554';
  const CANARIO_MONTO_A = '$875,400.00 M.N.';

  const TEXTO_CASO_A = [
    'DEMANDA ORDINARIA CIVIL DE PAGO DE PESOS.',
    `Actor: ${CANARIO_ACTOR_A}.`,
    `Demandado: ${CANARIO_DEMANDADO_A}.`,
    `Expediente: ${CANARIO_EXPEDIENTE_A}.`,
    `Domicilio procesal: ${CANARIO_DOMICILIO_A}.`,
    `Suerte principal reclamada: ${CANARIO_MONTO_A}.`,
    'Juzgado Décimo Civil de la Ciudad de México.',
    'HECHOS: Se celebró contrato de mutuo y el demandado incurrió en mora.',
    'PUNTOS PETITORIOS: Condenar al pago de la suerte principal y gastos.',
  ].join('\n');

  it('analyzePersonalTemplateText sanitiza nombre, expediente, domicilio y monto del caso A', () => {
    const analysis = analyzePersonalTemplateText(TEXTO_CASO_A, {
      knownValues: {
        actor: CANARIO_ACTOR_A,
        demandado: CANARIO_DEMANDADO_A,
        expediente: CANARIO_EXPEDIENTE_A,
        domicilio: CANARIO_DOMICILIO_A,
        monto: CANARIO_MONTO_A,
      },
    });

    const paramText = analysis.parameterizedText;

    // Ningún dato específico del Caso A sobrevive en la plantilla parametrizada
    expect(paramText).not.toContain(CANARIO_ACTOR_A);
    expect(paramText).not.toContain(CANARIO_DEMANDADO_A);
    expect(paramText).not.toContain(CANARIO_EXPEDIENTE_A);
    expect(paramText).not.toContain(CANARIO_DOMICILIO_A);
    expect(paramText).not.toContain(CANARIO_MONTO_A);

    // Estructura conservada con variables
    expect(paramText).toContain('{{actor}}');
    expect(paramText).toContain('{{demandado}}');
    expect(paramText).toContain('{{expediente}}');
    expect(paramText).toContain('{{domicilio}}');
    expect(paramText).toContain('{{monto}}');
    expect(paramText).toContain('DEMANDA ORDINARIA CIVIL DE PAGO DE PESOS');
    expect(paramText).toContain('PUNTOS PETITORIOS');
  });

  it('reutilizar plantilla en Caso B: se usan variables de B y datos de A no aparecen', () => {
    // 1. Crear plantilla desde Caso A
    const template = prepareExplicitTemplate(
      { content: TEXTO_CASO_A },
      {
        title: 'Plantilla Ordinaria Civil Cobro',
        creationIntent: 'EXPLICIT_TEMPLATE',
        knownValues: {
          actor: CANARIO_ACTOR_A,
          demandado: CANARIO_DEMANDADO_A,
          expediente: CANARIO_EXPEDIENTE_A,
          domicilio: CANARIO_DOMICILIO_A,
          monto: CANARIO_MONTO_A,
        },
      }
    );

    // 2. Aplicar plantilla con nuevos datos del Caso B
    const DATOS_CASO_B = {
      actor: 'PERSONA_NUEVA_GAMMA_B',
      demandado: 'EMPRESA_NUEVA_DELTA_B',
      expediente: 'EXP-NUEVO-CIVIL-2026-B',
      domicilio: 'CALLE_NUEVA_REFORMA_B',
      monto: '$1,200,000.00 M.N.',
    };

    let textoFinalB = template.content || '';
    for (const [key, val] of Object.entries(DATOS_CASO_B)) {
      textoFinalB = textoFinalB.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), val);
    }

    // 3. Confirmar que los datos de B están presentes
    expect(textoFinalB).toContain(DATOS_CASO_B.actor);
    expect(textoFinalB).toContain(DATOS_CASO_B.demandado);
    expect(textoFinalB).toContain(DATOS_CASO_B.expediente);
    expect(textoFinalB).toContain(DATOS_CASO_B.domicilio);
    expect(textoFinalB).toContain(DATOS_CASO_B.monto);

    // 4. Confirmar que NINGÚN dato canario de A aparece en B
    expect(textoFinalB).not.toContain(CANARIO_ACTOR_A);
    expect(textoFinalB).not.toContain(CANARIO_DEMANDADO_A);
    expect(textoFinalB).not.toContain(CANARIO_EXPEDIENTE_A);
    expect(textoFinalB).not.toContain(CANARIO_DOMICILIO_A);
    expect(textoFinalB).not.toContain(CANARIO_MONTO_A);

    // 5. La estructura jurídica original se conserva intacta
    expect(textoFinalB).toContain('DEMANDA ORDINARIA CIVIL DE PAGO DE PESOS');
    expect(textoFinalB).toContain('HECHOS');
    expect(textoFinalB).toContain('PUNTOS PETITORIOS');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// §11, §20 — RESTRICCIÓN DE PLANTILLAS POR MATERIA (BLOQUEO CROSS-MATTER)
// ══════════════════════════════════════════════════════════════════════════════

describe('§11, §20 — Restricción de plantillas por materia', () => {
  it('plantilla familiar + caso mercantil → BLOQUEAR / incompatible', () => {
    // Si el usuario tiene una fuente mercantil y se selecciona plantilla familiar
    const mercantilSource = createSourceDocument({
      id: 'src-mercantil-tpl',
      filename: 'pagare_mercantil.pdf',
      sourceValidated: true,
      content: 'PAGARÉ MERCANTIL. Suscriptor: EMPRESA_MERCANTIL_SA. Beneficiario: BANCO_BETA.',
      classification: { sourceDocumentType: 'DEMANDA_MERCANTIL', role: 'PRIMARY' },
    });

    expect(
      () => evaluateSourceOutputCompatibility({
        selectedDocumentType: 'demanda_divorcio',
        sourceDocuments: [mercantilSource],
      })
    ).toThrowError(expect.objectContaining({ code: SOURCE_DOCUMENT_INCOMPATIBLE }));
  });

  it('rankTemplateCandidates prioriza plantillas de la misma materia', () => {
    const templates = [
      { id: '1', name: 'Demanda ejecutiva mercantil', category: 'mercantil', matterId: 'mercantil' },
      { id: '2', name: 'Demanda alimentos familiar', category: 'familiar', matterId: 'familiar' },
      { id: '3', name: 'Contestación laboral', category: 'laboral', matterId: 'laboral' },
      { id: '4', name: 'Demanda civil ordinaria', category: 'civil', matterId: 'civil' },
    ];

    const ranked = rankTemplateCandidates(templates, 'mercantil', 'demanda_ejecutiva_mercantil');
    expect(ranked[0].category).toBe('mercantil');
    expect(ranked[0].id).toBe('1');
  });

  it('rankTemplateCandidates: plantilla familiar queda relegada ante expediente mercantil', () => {
    const templates = [
      { id: '1', name: 'Demanda alimentos familiar', category: 'familiar', matterId: 'familiar' },
      { id: '2', name: 'Pagaré mercantil', category: 'mercantil', matterId: 'mercantil' },
    ];

    const ranked = rankTemplateCandidates(templates, 'mercantil', 'demanda_ejecutiva_mercantil');
    const mercantilIdx = ranked.findIndex((t) => t.id === '2');
    const familiarIdx = ranked.findIndex((t) => t.id === '1');
    expect(mercantilIdx).toBeLessThan(familiarIdx);
  });
});
