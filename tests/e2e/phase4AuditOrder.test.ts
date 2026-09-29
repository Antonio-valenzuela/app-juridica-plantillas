import { describe, expect, it } from 'vitest';
import { buildAuditRunOrder } from '@/scripts/audit/run-professional-drafting-phase3';

describe('Fase 4: orden del banco de seis casos', () => {
  it('ejecuta primero los seis extensos y luego los seis profesionales', () => {
    const order = buildAuditRunOrder(['01', '02', '03', '04', '05', '06'], true);
    expect(order).toEqual([
      ['01', 'EXTENSIVE_40'], ['02', 'EXTENSIVE_40'], ['03', 'EXTENSIVE_40'],
      ['04', 'EXTENSIVE_40'], ['05', 'EXTENSIVE_40'], ['06', 'EXTENSIVE_40'],
      ['01', 'PROFESSIONAL_20'], ['02', 'PROFESSIONAL_20'], ['03', 'PROFESSIONAL_20'],
      ['04', 'PROFESSIONAL_20'], ['05', 'PROFESSIONAL_20'], ['06', 'PROFESSIONAL_20'],
    ]);
  });
});
