/**
 * Lote 7: bundles de investigación en el servidor, aislados por propietario y expediente. El cliente no
 * escribe bundles: solo la ruta de investigación (con consentimiento) los guarda. Datos sintéticos.
 */
import { describe, expect, it } from 'vitest';
import { loadResearchBundles, researchStoreKey, saveResearchBundles } from '@/lib/legal-engine/researchBundleStore';

const bundle = (legalIssueId: string) => ({ legalIssueId, requestId: 'r', researchStatus: 'VERIFIED_SUFFICIENT', researchHash: 'h' }) as any;

describe('almacén de bundles de investigación', () => {
  it('guarda y recupera los bundles por issue para el mismo propietario y expediente', () => {
    const key = researchStoreKey('owner-a', 'EXP-2026/001');
    saveResearchBundles(key, [bundle('issue-1'), bundle('issue-2')]);
    const loaded = loadResearchBundles(key);
    expect([...loaded.keys()].sort()).toEqual(['issue-1', 'issue-2']);
  });

  it('un propietario distinto no ve los bundles de otro', () => {
    saveResearchBundles(researchStoreKey('owner-a', 'EXP-2026/002'), [bundle('issue-x')]);
    expect(loadResearchBundles(researchStoreKey('owner-b', 'EXP-2026/002')).size).toBe(0);
  });

  it('el expediente se normaliza (espacios y mayúsculas)', () => {
    saveResearchBundles(researchStoreKey('owner-c', 'exp-2026/003'), [bundle('issue-y')]);
    expect(loadResearchBundles(researchStoreKey('owner-c', '  EXP-2026/003 ')).has('issue-y')).toBe(true);
  });

  it('sin bundles guardados devuelve un mapa vacío', () => {
    expect(loadResearchBundles(researchStoreKey('owner-d', 'nada')).size).toBe(0);
  });
});

import { unverifiedFundamentalsNotice } from '@/lib/legal-engine/researchBundleStore';

describe('aviso global de fundamentos no verificados', () => {
  it('sin bundles, el aviso existe y dice que los fundamentos no están verificados', () => {
    const notice = unverifiedFundamentalsNotice(new Map());
    expect(notice).toMatch(/fundamentos no verificados/i);
  });

  it('con bundles no hay aviso global', () => {
    expect(unverifiedFundamentalsNotice(new Map([['issue-1', bundle('issue-1')]]))).toBeNull();
  });
});
