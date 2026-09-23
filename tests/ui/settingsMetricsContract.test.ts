import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const componentPath = path.resolve(process.cwd(), 'app/machotes/components/WorkspaceModulesView.tsx');

describe('Configuración · métricas del sistema', () => {
  it('incluye métricas de uso, API, estado de IAs y actividad reciente', () => {
    const source = fs.readFileSync(componentPath, 'utf8');

    expect(source).toContain('Métricas del sistema');
    expect(source).toContain('Tiempo de uso');
    expect(source).toContain('Llamadas al API');
    expect(source).toContain('Estado de las IAs');
    expect(source).toContain('Actividad reciente');
    expect(source).toContain('Gemini');
    expect(source).toContain('Groq');
    expect(source).toContain('NVIDIA');
  });
});
