const fs = require('fs');
const path = require('path');

const filePath = 'lib/catalog/legalCatalog.ts';
const content = fs.readFileSync(filePath, 'utf8');

const oldStart = content.indexOf('function buildDocumentIdentifier(id: string): CatalogDocumentIdentifier {');
if (oldStart === -1) {
  console.error('Function not found');
  process.exit(1);
}

const oldFunc = content.substring(oldStart, oldStart + 1500);

const newFunc = `function buildDocumentIdentifier(id: string): CatalogDocumentIdentifier {
  const source = rowsById.get(id);
  if (!source) throw new Error(\`Catalog document identifier without hierarchy: \${id}\`);

  // Resolver variantes: si el tipo es una variante de otro tipo en su familia,
  // hereda la plantilla/estrategia del tipo base.
  let variantBaseId: string | null = null;
  if (source.familyId) {
    const familyBlueprint = FAMILY_BLUEPRINTS[source.familyId];
    if (familyBlueprint?.variants && familyBlueprint.variants[id]) {
      variantBaseId = familyBlueprint.variants[id].baseType;
    }
  }

  const template = variantBaseId ? DocumentTemplates[variantBaseId] : DocumentTemplates[id];
  const isFamily = FAMILY_IDENTIFIER_IDS.has(id);
  const label = LEGACY_LABELS[id] || labelFromId(id);
  const productStatus: CatalogStatus = OFFICIAL_FORM_IDS.has(id) ? 'REQUIRES_OFFICIAL_FORM' : ASSISTED_DRAFT_IDS.has(id) ? 'ASSISTED_DRAFT' : implementedIds.has(id) ? 'IMPLEMENTED' : 'CATALOG_ONLY';`;

const newContent = content.substring(0, oldStart) + newFunc + content.substring(oldStart + 1500);
fs.writeFileSync(filePath, newContent, 'utf8');
console.log('Replacement done');
const mojibake = (content.match(/Ã[\u0080-\u00BF]/g) || []).length;
console.log('mojibake=' + mojibake);