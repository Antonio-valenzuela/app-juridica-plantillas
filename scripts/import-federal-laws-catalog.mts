/**
 * Importa el catálogo de leyes federales vigentes desde el índice oficial de la Cámara de Diputados.
 *   npx tsx scripts/import-federal-laws-catalog.mts            (descarga el índice)
 *   npx tsx scripts/import-federal-laws-catalog.mts <archivo>  (usa una copia local del índice)
 * Escribe data/federal-laws/catalog.json solo si la validación pasa; nunca borra el catálogo anterior si falla.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { FEDERAL_LAWS_INDEX_URL, parseFederalLawsIndex, type FederalLawsCatalog } from '../lib/legal/federalLawsIndex';

const MIN_EXPECTED_LAWS = 200;
const target = path.resolve('data/federal-laws/catalog.json');

async function readIndex(): Promise<Buffer> {
  const local = process.argv[2];
  if (local) return fs.readFileSync(local);
  const response = await fetch(FEDERAL_LAWS_INDEX_URL, { headers: { 'User-Agent': 'LexPlantillas-catalogo/1.0' }, signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`INDEX_HTTP_${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

const bytes = await readIndex();
// El índice se publica en ISO-8859-1.
const laws = parseFederalLawsIndex(bytes.toString('latin1'));
const invalid = laws.filter((law) => !law.pdf_url.startsWith('https://www.diputados.gob.mx/LeyesBiblio/pdf/') || !law.titulo);
if (laws.length < MIN_EXPECTED_LAWS || invalid.length) {
  console.error(`VALIDACION_FALLIDA: ${laws.length} leyes leídas (mínimo ${MIN_EXPECTED_LAWS}), ${invalid.length} inválidas. No se modificó ${target}.`);
  process.exit(1);
}
const catalog: FederalLawsCatalog = {
  source: FEDERAL_LAWS_INDEX_URL,
  retrievedAt: new Date().toISOString(),
  sourceHash: createHash('sha256').update(bytes).digest('hex'),
  laws: laws.sort((a, b) => a.titulo.localeCompare(b.titulo, 'es-MX')),
};
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, JSON.stringify(catalog, null, 2) + '\n', 'utf8');
console.log(`OK: ${laws.length} leyes → ${path.relative(process.cwd(), target)} (${laws.filter((law) => law.ultima_reforma).length} con fecha de última reforma).`);
