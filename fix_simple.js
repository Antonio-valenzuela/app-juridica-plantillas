const fs = require('fs');

const filePath = 'lib/catalog/legalCatalog.ts';
const content = fs.readFileSync(filePath, 'utf8');

const oldStr = `const template = variantBaseTemplate || DocumentTemplates[id];`;
const newStr = `const template = variantBaseId ? DocumentTemplates[variantBaseId] : DocumentTemplates[id];`;

if (!content.includes(oldStr)) {
  console.error('Old string not found');
  process.exit(1);
}

const newContent = content.replace(oldStr, newStr);
fs.writeFileSync(filePath, newContent, 'utf8');
console.log('Replacement done');
const mojibake = (content.match(/Ã[\u0080-\u00BF]/g) || []).length;
console.log('mojibake=' + mojibake);