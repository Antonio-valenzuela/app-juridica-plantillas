import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const cssPath = path.resolve(process.cwd(), 'app/globals.css');

describe('Shell de escritorio redimensionable', () => {
  it('mantiene sidebar y encabezado proporcionales en monitores amplios', () => {
    const css = fs.readFileSync(cssPath, 'utf8');
    expect(css).toContain('--lex-sidebar-width: clamp(');
    expect(css).toContain('@media (min-width: 1181px)');
    expect(css).toContain('@media (max-width: 1180px)');
    expect(css).toContain('.lex-content {\n    padding-left: var(--lex-sidebar-width) !important;');
  });
});
