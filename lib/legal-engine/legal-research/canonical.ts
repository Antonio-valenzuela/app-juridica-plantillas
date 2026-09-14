const ID_ARRAY_KEY = /(?:Ids|IDs)$/;
const TRANSIENT_METADATA_KEY = /^(?:createdAt|retrievedAt|checkedAt|startedAt|completedAt|decidedAt|timestamp)$/i;

export function canonicalizeResearchValue(value: unknown, key?: string): unknown {
  if (Array.isArray(value)) {
    const canonical = value.map((item) => canonicalizeResearchValue(item));
    if (key && ID_ARRAY_KEY.test(key) && canonical.every((item) => typeof item === 'string')) {
      return [...(canonical as string[])].sort();
    }
    return canonical;
  }

  if (typeof value === 'object' && value !== null) {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((result, childKey) => {
        result[childKey] = canonicalizeResearchValue((value as Record<string, unknown>)[childKey], childKey);
        return result;
      }, {});
  }

  return value;
}

function withoutTransientMetadata(value: unknown, key?: string): unknown {
  if (key && TRANSIENT_METADATA_KEY.test(key)) return undefined;
  if (Array.isArray(value)) {
    return value
      .map((item) => withoutTransientMetadata(item))
      .filter((item) => item !== undefined);
  }
  if (typeof value === 'object' && value !== null) {
    return Object.keys(value as Record<string, unknown>).reduce<Record<string, unknown>>((result, childKey) => {
      const child = withoutTransientMetadata((value as Record<string, unknown>)[childKey], childKey);
      if (child !== undefined) result[childKey] = child;
      return result;
    }, {});
  }
  return value;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalizeResearchValue(withoutTransientMetadata(value)));
}

export function stableResearchId(prefix: string, value: unknown): string {
  const input = canonicalJson(value);
  let first = 0x811c9dc5;
  let second = 0x01000193;
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ (code + index), 0x01000193);
  }
  return `${prefix}-${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`;
}

export async function sha256ResearchValue(value: unknown): Promise<string> {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.subtle) throw new Error('WEB_CRYPTO_UNAVAILABLE');
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const digest = await cryptoApi.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
