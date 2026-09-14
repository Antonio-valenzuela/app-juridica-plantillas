import type { ExtractionCandidate, CaseParty, PartyRole, PartyExtractionResult } from './types';

const ROLE_LABELS: Array<[RegExp, PartyRole]> = [
  [/^ACTOR(?:A)?$/i, 'ACTOR'],
  [/^DEMANDADO(?:A)?$/i, 'DEMANDADO'],
  [/^PROMOVENTE$/i, 'PROMOVENTE'],
  [/^QUEJOSO(?:A)?$/i, 'QUEJOSO'],
  [/^TERCERO(?:\s+INTERESADO)?$/i, 'TERCERO'],
  [/^AUTORIDAD(?:\s+RESPONSABLE)?$/i, 'AUTORIDAD'],
  [/^REPRESENTANTE$/i, 'REPRESENTANTE'],
  [/^AUTORIZADO(?:A)?$/i, 'AUTORIZADO'],
  [/^APODERADO(?:A)?$/i, 'APODERADO'],
];

function roleForLabel(label: string): PartyRole | undefined {
  return ROLE_LABELS.find(([pattern]) => pattern.test(label.trim()))?.[1];
}

function parsePartyCandidate(text: string): { role: PartyRole; name: string } | undefined {
  const match = text.trim().match(/^([^:]{2,80}):\s*(.+)$/);
  if (!match) return undefined;
  const role = roleForLabel(match[1]);
  if (!role) return undefined;
  const name = match[2].replace(/[.;,]+$/, '').trim();
  return name ? { role, name } : undefined;
}

/** Extract an alias only when the source explicitly declares one. */
export function resolveExplicitAlias(text: string): string | undefined {
  const match = text.match(/\b(?:tamb[ié]n\s+conocid[oa]\s+como|alias|a\.k\.a\.)\s*[:\-]?\s*([^,;]+)/i);
  return match?.[1]?.replace(/[.;]+$/, '').trim() || undefined;
}

function normalizedTokens(name: string): string[] {
  return name
    .toLocaleLowerCase('es-MX')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function similarNames(left: string, right: string): boolean {
  if (left.trim().toLocaleLowerCase() === right.trim().toLocaleLowerCase()) return false;
  const leftTokens = normalizedTokens(left);
  const rightTokens = normalizedTokens(right);
  if (!leftTokens[0] || !rightTokens[0]) return false;
  return leftTokens[0] === rightTokens[0] || leftTokens.some((token) => rightTokens.includes(token));
}

function partyId(role: PartyRole, name: string, index: number): string {
  const slug = normalizedTokens(name).slice(0, 3).join('-') || 'unknown';
  return `party-${role.toLowerCase()}-${slug}-${index}`;
}

export function extractParties(candidates: ExtractionCandidate[]): PartyExtractionResult {
  const parties: CaseParty[] = [];
  const reviewReasons: string[] = [];

  for (const candidate of candidates) {
    const parsed = parsePartyCandidate(candidate.rawText);
    if (!parsed) continue;
    const explicitAlias = resolveExplicitAlias(parsed.name);
    const aliases = explicitAlias ? [explicitAlias] : [];
    const party: CaseParty = {
      id: partyId(parsed.role, parsed.name, parties.length),
      name: parsed.name,
      role: parsed.role,
      aliases,
      provenance: [...candidate.provenance],
      confidence: candidate.classification?.confidence ?? 0.8,
      // Source labels are evidence about a role, not client or lawyer confirmation.
      confirmed: false,
    };
    parties.push(party);
  }

  for (let index = 0; index < parties.length; index += 1) {
    for (let other = index + 1; other < parties.length; other += 1) {
      if (similarNames(parties[index].name || '', parties[other].name || '')) {
        if (!reviewReasons.includes('POSSIBLE_IDENTITY_ALIAS_REQUIRES_REVIEW')) {
          reviewReasons.push('POSSIBLE_IDENTITY_ALIAS_REQUIRES_REVIEW');
        }
      }
    }
  }

  return { parties, reviewReasons };
}
