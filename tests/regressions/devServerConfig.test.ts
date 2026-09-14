import { describe, expect, it } from 'vitest';
import packageJson from '../../package.json';

describe('Servidor de desarrollo', () => {
  it('usa Turbopack para evitar la carrera de manifiesto de Webpack en Windows', () => {
    expect(packageJson.scripts.dev).toContain('--turbopack');
    expect(packageJson.scripts.dev).not.toContain('--webpack');
  });
});
