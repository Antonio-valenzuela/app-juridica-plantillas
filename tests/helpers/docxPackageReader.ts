import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';

export interface DocxPackageReader {
  entryNames: readonly string[];
  readText(entryName: string): Promise<string>;
}

export async function readDocxPackage(bytes: Uint8Array): Promise<DocxPackageReader> {
  const zip = await JSZip.loadAsync(bytes);
  const entryNames = Object.keys(zip.files).filter((entryName) => !zip.files[entryName]?.dir);

  return {
    entryNames,
    async readText(entryName: string): Promise<string> {
      const entry = zip.file(entryName);
      if (!entry) throw new Error(`Missing DOCX package entry: ${entryName}`);
      return entry.async('text');
    },
  };
}

export function parseXml(xml: string): ReturnType<DOMParser['parseFromString']> {
  const errors: string[] = [];
  const document = new DOMParser({
    errorHandler: {
      warning: () => undefined,
      error: (message) => errors.push(message),
      fatalError: (message) => errors.push(message),
    },
  }).parseFromString(xml, 'application/xml');

  if (errors.length > 0 || !document.documentElement) {
    throw new Error(`Malformed XML: ${errors.join('; ') || 'missing document element'}`);
  }
  return document;
}

export function extractWordDocumentParagraphs(xml: string): string[] {
  const document = parseXml(xml);
  return Array.from(document.getElementsByTagName('w:p')).map((paragraph) =>
    Array.from(paragraph.getElementsByTagName('w:t'))
      .map((textNode) => textNode.textContent || '')
      .join(''),
  );
}

export function normalizeDocxText(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}
