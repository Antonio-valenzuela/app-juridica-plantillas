import { createOfficialJsonAdapter, type OfficialAdapterConfig } from './officialJson';
export const SCJN_SJF_OFFICIAL_DOMAINS = ['scjn.gob.mx','www.scjn.gob.mx','sjf2.scjn.gob.mx','sjf.scjn.gob.mx','sjfsemanal.scjn.gob.mx'] as const;
export interface ScjnAdapterConfig extends Omit<OfficialAdapterConfig, 'searchUrl' | 'allowedDomains'> { searchUrl?: string; allowedDomains?: readonly string[]; }
export function createScjnAdapter(config: ScjnAdapterConfig): ReturnType<typeof createOfficialJsonAdapter> { return createOfficialJsonAdapter({ ...config, id: 'SCJN', supportedAuthorityTypes: ['JURISPRUDENCE','THESIS','PRECEDENT'], searchUrl: config.searchUrl || 'https://sjfsemanal.scjn.gob.mx/', allowedDomains: config.allowedDomains || SCJN_SJF_OFFICIAL_DOMAINS }); }
