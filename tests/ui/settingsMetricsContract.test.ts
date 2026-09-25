import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const componentPath = path.resolve(process.cwd(), 'app/machotes/components/WorkspaceModulesView.tsx');

describe('Configuración · analíticas persistidas', () => {
  it('integra el panel de analíticas reales sin inventar métricas de proveedores', () => {
    const source = fs.readFileSync(componentPath, 'utf8');

    expect(source).toContain("import { AnalyticsPanel } from './AnalyticsPanel';");
    expect(source).toContain('Analíticas, perfil y estado real de persistencia.');
    expect(source).not.toContain('AiUsageEvent');
    expect(source).not.toContain('Gemini');
    expect(source).not.toContain('Groq');
    expect(source).not.toContain('NVIDIA');
  });
});
