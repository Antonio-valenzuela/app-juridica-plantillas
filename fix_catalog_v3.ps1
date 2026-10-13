$old = Get-Content lib\catalog\legalCatalog.ts -Raw -Encoding UTF8
$idx = $old.IndexOf("function buildDocumentIdentifier")
$oldFunc = $old.Substring($old.IndexOf("function buildDocumentIdentifier"), 1500)

$newFunc = @"
function buildDocumentIdentifier(id: string): CatalogDocumentIdentifier {
  const source = rowsById.get(id);
  if (!source) throw new Error(`Catalog document identifier without hierarchy: ${id}`);

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
  const productStatus: CatalogStatus = OFFICIAL_FORM_IDS.has(id) ? 'REQUIRES_OFFICIAL_FORM' : ASSISTED_DRAFT_IDS.has(id) ? 'ASSISTED_DRAFT' : implementedIds.has(id) ? 'IMPLEMENTED' : 'CATALOG_ONLY';
"@

$c = Get-Content lib\catalog\legalCatalog.ts -Raw -Encoding UTF8
$oldFunc = $old.Substring($old.IndexOf("function buildDocumentIdentifier"), 1500)
$c = $old -replace [System.Text.RegularExpressions.Regex]::Escape($oldFunc), $newFunc
[IO.File]::WriteAllText((Resolve-Path lib\catalog\legalCatalog.ts), \$c, (New-Object Text.UTF8Encoding \$false))
"mojibake=" + ([regex]::Matches((Get-Content lib\catalog\legalCatalog.ts -Raw -Encoding UTF8),"Ã[\u0080-\u00BF]")).Count