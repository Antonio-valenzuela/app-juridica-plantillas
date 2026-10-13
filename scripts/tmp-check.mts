import { getCatalogDocument } from "@/lib/catalog/legalCatalog";
const doc = getCatalogDocument("demanda_oral_mercantil");
console.log(JSON.stringify(doc, null, 2));
