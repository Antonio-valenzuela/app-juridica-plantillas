import { access } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const requiredSourceAssets = [
  'next.config.ts',
  'prisma/schema.prisma',
  'spa.traineddata',
  'node_modules/tesseract.js/src/worker-script/node/index.js',
  'data/uploads/templates',
];

const missing = [];
for (const relative of requiredSourceAssets) {
  try {
    await access(path.join(root, relative));
  } catch {
    missing.push(relative);
  }
}

const standaloneRequired = ['.next/standalone/server.js', '.next/static'];
for (const relative of standaloneRequired) {
  try {
    await access(path.join(root, relative));
  } catch {
    missing.push(relative);
  }
}

if (missing.length > 0) {
  console.error(`DISTRIBUTION=BLOCKED missing=${missing.join(',')}`);
  process.exitCode = 1;
} else {
  console.log('DISTRIBUTION=READY source-assets-and-standalone-output-present');
}
