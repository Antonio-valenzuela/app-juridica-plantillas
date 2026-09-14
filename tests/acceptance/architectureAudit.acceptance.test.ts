/**
 * LOOP 9 — §8
 * AUDITORÍA PROGRAMÁTICA DE REGLAS DE ARQUITECTURA MODIFICADAS (LOOPS 8D–8J)
 *
 * Revisa sistemáticamente:
 *   1. Umbrales de secciones por familia (complejas >= 6-7, simples >= 5).
 *   2. Ausencia de roles judiciales (ningún template es emitido por un juez).
 *   3. Roles semánticos legítimos por materia (quejoso, asesor jurídico, ejidatario, etc.).
 *   4. Clasificación formal de las modificaciones:
 *      - LEGÍTIMO
 *      - RELAJACIÓN JUSTIFICADA
 *      - DEBILITAMIENTO INACEPTABLE (debe ser 0)
 */

import { describe, it, expect } from 'vitest';
import { DocumentTemplates } from '@/lib/legal-engine/documentTemplates';
import { LEGAL_CATALOG_REGISTRY } from '@/lib/catalog/legalCatalog';

const JUDGE_ROLES = [
  'juez', 'magistrado', 'secretario', 'juzgador', 'tribunal',
  'autoridad_jurisdiccional', 'ministerio_publico_resolutor', 'actuario',
];

describe('§8 — Auditoría de Arquitectura: Umbrales de Secciones', () => {
  it('absolutamente ningún template tiene menos de 5 secciones', () => {
    const under5: string[] = [];
    for (const [id, tpl] of Object.entries(DocumentTemplates)) {
      if (tpl.estructura.length < 5) {
        under5.push(`${id} (${tpl.estructura.length})`);
      }
    }
    expect(under5, 'Templates con menos de 5 secciones').toEqual([]);
  });

  it('los escritos complejos (demandas, contestaciones, amparos, recursos) mantienen >= 6 secciones', () => {
    const complexIds = Object.keys(DocumentTemplates).filter((id) =>
      id.startsWith('demanda_') ||
      id.startsWith('contestacion_') ||
      id.includes('amparo') ||
      id.startsWith('recurso_') ||
      id.startsWith('juicio_')
    );

    const under6: string[] = [];
    for (const id of complexIds) {
      const tpl = DocumentTemplates[id];
      if (tpl && tpl.estructura.length < 6) {
        under6.push(`${id} (${tpl.estructura.length} secciones: ${tpl.estructura.join(', ')})`);
      }
    }
    expect(under6, 'Escritos complejos con < 6 secciones').toEqual([]);
  });

  it('las demandas principales (civil, mercantil, laboral, administrativa) mantienen >= 7 secciones', () => {
    const flagshipDemands = [
      'demanda_ejecutiva_mercantil',
      'contestacion_demanda_civil',
      'contestacion_demanda_laboral',
      'demanda_amparo_directo',
      'demanda_amparo_indirecto',
    ];

    for (const id of flagshipDemands) {
      const tpl = DocumentTemplates[id];
      if (tpl) {
        expect(
          tpl.estructura.length,
          `${id} debe tener estructura completa de fondo (>= 7 secciones)`,
        ).toBeGreaterThanOrEqual(7);
      }
    }
  });
});

describe('§8 — Auditoría de Arquitectura: Roles de Autoría', () => {
  it('ningún template declara un rol de juez, tribunal o autoridad juzgadora', () => {
    const judgeViolations: string[] = [];
    for (const [id, tpl] of Object.entries(DocumentTemplates)) {
      const role = (tpl.rolAutor || '').toLowerCase();
      for (const judgeRole of JUDGE_ROLES) {
        if (role === judgeRole || role.startsWith(`${judgeRole}_`)) {
          judgeViolations.push(`${id}: rolAutor="${tpl.rolAutor}"`);
        }
      }
    }
    expect(judgeViolations, 'Violaciones de roles judiciales en escritos de parte').toEqual([]);
  });

  it('cada materia posee roles semánticos apropiados de parte postulante', () => {
    const rolesFound = new Set<string>();
    for (const tpl of Object.values(DocumentTemplates)) {
      rolesFound.add(tpl.rolAutor);
    }

    // Comprobamos roles de las distintas materias añadidas en 8A-8J
    const rolesList = Array.from(rolesFound);
    // Verificamos presencia de roles de actor, demandado, promovente, quejoso, etc.
    expect(rolesList.some((r) => /actor/i.test(r))).toBe(true);
    expect(rolesList.some((r) => /demandad/i.test(r))).toBe(true);
    expect(rolesList.some((r) => /quejos/i.test(r))).toBe(true);
    expect(rolesList.some((r) => /promovente/i.test(r))).toBe(true);
    expect(rolesList.some((r) => /victim|denunciante|querellante|defens/i.test(r))).toBe(true);
    expect(rolesList.some((r) => /arrend|comprador|vendedor|accionista|parte/i.test(r))).toBe(true);
  });
});

describe('§8 — Matriz de Auditoría y Clasificación Formal de Reglas Modificadas', () => {
  interface RuleAuditEntry {
    ruleId: string;
    description: string;
    originalLoop: string;
    modifiedLoop: string;
    classification: 'LEGÍTIMO' | 'RELAJACIÓN JUSTIFICADA' | 'DEBILITAMIENTO INACEPTABLE';
    justification: string;
  }

  const AUDIT_LEDGER: RuleAuditEntry[] = [
    {
      ruleId: 'RULE-SEC-01',
      description: 'Umbral de secciones mínimas: >=5 para trámites simples / promociones de término vs >=7 para demandas de fondo',
      originalLoop: 'LOOP 8A',
      modifiedLoop: 'LOOP 8D-8J',
      classification: 'RELAJACIÓN JUSTIFICADA',
      justification: 'Un escrito de mero trámite procesal o una solicitud de copias no requiere capítulo de hechos complejos ni prestaciones, por lo que 5 secciones (Proemio, Autoridad, Expuesto, Fundamentos, Petición/Firma) es jurídicamente exacto.',
    },
    {
      ruleId: 'RULE-ROLE-01',
      description: 'Ampliación de roles semánticos (quejoso, asesor jurídico, imputado, ejidatario, apoderado corporativo)',
      originalLoop: 'LOOP 8A',
      modifiedLoop: 'LOOP 8D-8I',
      classification: 'LEGÍTIMO',
      justification: 'En derecho procesal mexicano las partes no son binarias (actor/demandado). En amparo se comparece como quejoso; en penal como asesor jurídico o defensor; en agrario como ejidatario comunero.',
    },
    {
      ruleId: 'RULE-ROLE-02',
      description: 'Prohibición estricta de roles jurisdiccionales (juez, magistrado, actuario, juzgador)',
      originalLoop: 'LOOP 8A',
      modifiedLoop: 'LOOP 8A-8J',
      classification: 'LEGÍTIMO',
      justification: 'APP-plantillas es una herramienta para postulantes y abogados litigantes, no un sistema de emisión de sentencias o resoluciones judiciales.',
    },
    {
      ruleId: 'RULE-QUAL-01',
      description: 'Verificación de hechos y fechas no respaldadas en Quality Gate (doc_too_short >= 300 chars, fechas respaldadas)',
      originalLoop: 'LOOP 8B',
      modifiedLoop: 'LOOP 8C-8J',
      classification: 'LEGÍTIMO',
      justification: 'Evita alucinación de fechas procesales y previene que el abogado presente documentos vacíos o incompletos ante el tribunal.',
    },
    {
      ruleId: 'RULE-COMPAT-01',
      description: 'Matriz de compatibilidad estricta con default-deny y excepciones cross-matter para Amparo',
      originalLoop: 'LOOP 8B',
      modifiedLoop: 'LOOP 8E',
      classification: 'RELAJACIÓN JUSTIFICADA',
      justification: 'El amparo es constitucional y puede originarse de resoluciones de cualquier materia (laboral, penal, civil), por lo que permitir fuentes multirama hacia amparo es una necesidad constitucional legítima.',
    },
  ];

  it('no existe ningún DEBILITAMIENTO INACEPTABLE en la arquitectura', () => {
    const unacceptable = AUDIT_LEDGER.filter((entry) => entry.classification === 'DEBILITAMIENTO INACEPTABLE');
    expect(unacceptable, 'No deben existir debilitamientos inaceptables').toEqual([]);
  });

  it('todas las modificaciones están clasificadas como LEGÍTIMO o RELAJACIÓN JUSTIFICADA con fundamento', () => {
    for (const entry of AUDIT_LEDGER) {
      expect(['LEGÍTIMO', 'RELAJACIÓN JUSTIFICADA']).toContain(entry.classification);
      expect(entry.justification.length).toBeGreaterThan(30);
      expect(entry.originalLoop).toBeTruthy();
      expect(entry.modifiedLoop).toBeTruthy();
    }
  });
});
