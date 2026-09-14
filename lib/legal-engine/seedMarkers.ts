/**
 * seedMarkers.ts — Detección y normalización centralizada de marcadores de semilla y placeholders de generación.
 *
 * Fuente única de verdad para detectar instrucciones internas del pipeline
 * como "[Desarrollar por la IA...]" o "[Completar por la IA...]".
 *
 * Regla arquitectónica FASE 2:
 *   hasSeedMarkers(text) === true
 *     => requiresGeneration = true
 *     => preserveDirect = false (NUNCA PRESERVAR DIRECTO)
 *     => exportAllowed = false (BLOQUEO DE EXPORTACIÓN)
 *     => isMature = false (NO COMPLETION)
 */

/** Patrones canónicos y variantes legacy de marcadores de semilla e instrucciones internas */
export const SEED_MARKER_PATTERNS: readonly RegExp[] = [
  // [Desarrollar por la IA conforme a las fuentes permitidas y las reglas del tipo ...]
  /\[\s*Desarrollar\s+por\s+la\s+IA\b[^\]]*\]/gi,
  // [Completar por la IA ...] / [Completar por la IA congruente con el objetivo procesal]
  /\[\s*Completar\s+por\s+la\s+IA\b[^\]]*\]/gi,
  // [SECCIÓN GENERADA: ...]
  /\[\s*SECCI[ÓO]N\s+GENERADA\s*:[^\]]*\]/gi,
  // [REQUIERE DESARROLLO JURÍDICO CON FUENTES AUTORIZADAS Y REVISIÓN PROFESIONAL]
  /\[\s*REQUIERE\s+DESARROLLO\s+JUR[ÍI]DICO\b[^\]]*\]/gi,
  // [PENDIENTE DE DESARROLLO ...]
  /\[\s*PENDIENTE\s+DE\s+DESARROLLO\b[^\]]*\]/gi,
  // [DATO PENDIENTE: desarrollar únicamente con el CommercialEnforcementContext confirmado]
  /\[\s*DATO\s+PENDIENTE\s*:\s*desarrollar\s+únicamente\b[^\]]*\]/gi,
  // [ DATO PENDIENTE: peticiones confirmadas por el abogado ] (marcador seed de petición comercial)
  /\[\s*DATO\s+PENDIENTE\s*:\s*peticiones\s+confirmadas\s+por\s+el\s+abogado\s*\]/gi,
];

/** Patrones de dependencias fácticas no resueltas generadas por el motor o la IA */
export const UNRESOLVED_FACTUAL_DEPENDENCY_PATTERNS: readonly RegExp[] = [
  /\[\s*DATO\s+PENDIENTE\s+DE\s+EXPEDIENTE\b[^\]]*\]/gi,
  /\[\s*REQUIERE\s+INSTRUCCI[ÓO]N\s+DEL\s+ABOGADO\b[^\]]*\]/gi,
  /\[\s*DATO\s+NO\s+DISPONIBLE\s+EN\s+EXPEDIENTE\b[^\]]*\]/gi,
  /\[\s*DATO\s+PENDIENTE\s*:[^\]]*\]/gi,
];

/**
 * Determina si una cadena contiene dependencias fácticas pendientes de resolver.
 * Nunca deben permitirse en un documento final ni autorizarse para exportación.
 */
export function hasUnresolvedFactualDependencies(text: string | null | undefined): boolean {
  if (!text || typeof text !== 'string') return false;
  for (const pattern of UNRESOLVED_FACTUAL_DEPENDENCY_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) return true;
  }
  return false;
}

/**
 * Extrae todas las dependencias fácticas pendientes de resolver en el texto.
 */
export function extractUnresolvedFactualDependencies(text: string | null | undefined): string[] {
  if (!text || typeof text !== 'string') return [];
  const found: string[] = [];
  const seen = new Set<string>();

  for (const pattern of UNRESOLVED_FACTUAL_DEPENDENCY_PATTERNS) {
    pattern.lastIndex = 0;
    const matches = text.match(pattern);
    if (matches) {
      for (const m of matches) {
        const trimmed = m.trim();
        if (!seen.has(trimmed)) {
          seen.add(trimmed);
          found.push(trimmed);
        }
      }
    }
  }

  return found;
}

/**
 * Determina si una cadena de texto contiene uno o más marcadores de semilla de generación.
 */
export function hasSeedMarkers(text: string | null | undefined): boolean {
  if (!text || typeof text !== 'string') return false;
  for (const pattern of SEED_MARKER_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) return true;
  }
  return false;
}

/**
 * Determina si el texto ES en sí mismo un marcador de semilla (es decir, prácticamente solo contiene el marcador).
 */
export function isSeedMarker(text: string | null | undefined): boolean {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return false;
  return hasSeedMarkers(trimmed);
}

/**
 * Extrae todas las ocurrencias de marcadores de semilla encontradas en el texto.
 */
export function extractSeedMarkers(text: string | null | undefined): string[] {
  if (!text || typeof text !== 'string') return [];
  const found: string[] = [];
  const seen = new Set<string>();

  for (const pattern of SEED_MARKER_PATTERNS) {
    pattern.lastIndex = 0;
    const matches = text.match(pattern);
    if (matches) {
      for (const m of matches) {
        const trimmed = m.trim();
        if (!seen.has(trimmed)) {
          seen.add(trimmed);
          found.push(trimmed);
        }
      }
    }
  }

  return found;
}

/**
 * Remueve los marcadores de semilla de un texto, dejando el contenido legítimo circundante.
 */
export function stripSeedMarkers(text: string | null | undefined): string {
  if (!text || typeof text !== 'string') return '';
  let cleaned = text;
  for (const pattern of SEED_MARKER_PATTERNS) {
    pattern.lastIndex = 0;
    cleaned = cleaned.replace(pattern, '');
  }
  return cleaned.replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Evalúa si un bloque de contenido tiene necesidad imperativa de generación
 * porque contiene marcadores de semilla o porque su texto está vacío y requiere IA.
 */
export function evaluateBlockSeedStatus(block: {
  text?: string;
  isManuallyEdited?: boolean;
  requiresAi?: boolean;
  generationRequirement?: string;
}): {
  hasSeedMarker: boolean;
  requiresGeneration: boolean;
  reason?: string;
} {
  const text = block.text || '';
  const seedFound = hasSeedMarkers(text);

  if (seedFound) {
    return {
      hasSeedMarker: true,
      requiresGeneration: true,
      reason: 'El bloque contiene marcadores de semilla/placeholder de IA no resueltos',
    };
  }

  if (block.generationRequirement === 'AI_REQUIRED' && !text.trim()) {
    return {
      hasSeedMarker: false,
      requiresGeneration: true,
      reason: 'El bloque está marcado como AI_REQUIRED y se encuentra pendiente de redacción',
    };
  }

  return {
    hasSeedMarker: false,
    requiresGeneration: false,
  };
}
