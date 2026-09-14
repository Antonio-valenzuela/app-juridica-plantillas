import { describe, expect, it } from 'vitest';
import type { DocumentCoverageItem } from '@/lib/legal-engine/coverageMatrix';
import type { DocumentNode } from '@/lib/legal-engine/types';

describe('rich Coverage contracts', () => {
  it('represents entity links, scope, policy and blocking without changing legacy fields', () => {
    const item: DocumentCoverageItem = {
      id: 'cov-claim-rich-1',
      category: 'CLAIM_RESPONSE',
      description: 'Responder la pretensión fuente',
      required: true,
      status: 'needs_client_position',
      targetSectionIds: ['sec-prestaciones'],
      sourceEntityType: 'CLAIM',
      sourceEntityIds: ['claim-rich-1'],
      claimIds: ['claim-rich-1'],
      scope: 'SUBSTANTIVE',
      satisfactionPolicy: 'REQUIRES_SEMANTIC_RESPONSE',
      blocking: true,
      requiresClientPosition: true,
      statusReason: 'La postura del cliente no está confirmada',
      relationStatus: 'EXPLICIT',
      provenance: [],
    };
    expect(item.claimIds).toEqual(['claim-rich-1']);
    expect(item.scope).toBe('SUBSTANTIVE');
    expect(item.satisfactionPolicy).toBe('REQUIRES_SEMANTIC_RESPONSE');
    expect(item.blocking).toBe(true);
  });

  it('allows a DocumentNode to explain its Coverage origin', () => {
    const section = {
      coverageItemIds: ['cov-formal-header'],
      requiredCoverageItemIds: ['cov-formal-header'],
      coverageReason: 'Requisito formal del template',
    } as DocumentNode;
    expect(section.coverageItemIds).toEqual(['cov-formal-header']);
    expect(section.requiredCoverageItemIds).toEqual(['cov-formal-header']);
    expect(section.coverageReason).toContain('template');
  });
});
