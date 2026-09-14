import { createSourceDocument } from '@/lib/legal-engine/context';
import type { UploadedSourceDocument } from '@/lib/legal-engine/types';

/** Synthetic, source-grounded fixtures used by the layered extraction tests. */
export function fixtureA_cleanText(): UploadedSourceDocument {
  return createSourceDocument({
    id: 'fixture-a-clean',
    filename: 'fixture-a-clean.txt',
    type: 'txt',
    sourceValidated: true,
    pages: [{ page: 1, text: [
      'ACTOR: Ana López',
      'DEMANDADO: Beta Servicios, S.A.',
      'PRESTACIONES:',
      '1. El pago de la factura pendiente.',
      '2. El reconocimiento de los intereses pactados.',
      'HECHOS:',
      '1. Se celebró el contrato el 4 de marzo de 2026.',
      '2. La factura fue entregada el 8 de marzo de 2026.',
      'PRUEBAS: contrato, factura y requerimiento',
    ].join('\n'), chars: 0 }],
  });
}

export function fixtureB_continuousText(): UploadedSourceDocument {
  const text = 'La parte actora afirma que el pago quedó pendiente. El contrato se firmó el 4 de marzo de 2026 y la factura se entregó el 8 de marzo de 2026.';
  return createSourceDocument({
    id: 'fixture-b-continuous',
    filename: 'fixture-b-continuous.txt',
    type: 'txt',
    sourceValidated: true,
    pages: [{ page: 2, text, chars: text.length }],
  });
}

export function fixtureC_commaEvidence(): UploadedSourceDocument {
  const text = [
    'HECHOS:',
    '1. El contrato fue celebrado el 4 de marzo de 2026.',
    'PRUEBAS: contrato, recibos, requerimiento',
    'La documental se relaciona con el hecho 1.',
  ].join('\n');
  return createSourceDocument({
    id: 'fixture-c-evidence',
    filename: 'fixture-c-evidence.txt',
    type: 'txt',
    sourceValidated: true,
    pages: [{ page: 3, text, chars: text.length }],
  });
}

export function fixtureD_conflictingSources(): UploadedSourceDocument[] {
  return [
    createSourceDocument({
      id: 'fixture-d-one',
      filename: 'fixture-d-one.txt',
      type: 'txt',
      sourceValidated: true,
      pages: [{ page: 1, text: 'ACTOR: Ana López\nDEMANDADO: Beta Servicios\nFECHA: 4 de marzo de 2026\nIMPORTE: $10,000 MXN', chars: 0 }],
    }),
    createSourceDocument({
      id: 'fixture-d-two',
      filename: 'fixture-d-two.txt',
      type: 'txt',
      sourceValidated: true,
      pages: [{ page: 1, text: 'ACTOR: Ana\nDEMANDADO: Beta Servicios\nFECHA: 8 de marzo de 2026\nIMPORTE: $12,000 MXN', chars: 0 }],
    }),
  ];
}

export function fixtureE_incompleteCase(): UploadedSourceDocument {
  const text = 'ACTOR: Ana López\nFECHA DEL EVENTO: marzo de 2026\nHECHOS: Se recibió un contrato mencionado en el expediente.\nPRUEBAS: contrato mencionado';
  return createSourceDocument({
    id: 'fixture-e-incomplete',
    filename: 'fixture-e-incomplete.txt',
    type: 'txt',
    sourceValidated: true,
    pages: [{ page: 4, text, chars: text.length }],
  });
}
