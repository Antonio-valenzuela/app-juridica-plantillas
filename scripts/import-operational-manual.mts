import { importCanonicalManual } from '../lib/operational-manual/store';

const source = process.argv[2] || 'C:\\Users\\yahir\\Downloads\\LEX_PLANTILLAS_MANUAL_OPERATIVO.pdf';
const index = await importCanonicalManual(source, process.argv[3]);
const distribution = Object.fromEntries([...new Set(index.fragments.map((fragment) => fragment.matter))].sort().map((matter) => [matter, index.fragments.filter((fragment) => fragment.matter === matter).length]));
process.stdout.write(JSON.stringify({ manifest: index.manifest, distribution, alwaysActive: index.fragments.filter((fragment) => fragment.alwaysActive).map((fragment) => ({ id: fragment.stableRuleId, page: fragment.physicalPage, text: fragment.originalText.trim() })) }, null, 2));
