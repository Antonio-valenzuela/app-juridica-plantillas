import { describe, expect, it } from 'vitest';
import { toActiveCaseContext } from '@/lib/workspace/activeCaseContext';
import { deriveNvidiaIndicator } from '@/lib/runtime/nvidiaStatus';

describe('encabezado del workspace', () => {
  it('usa el expediente y órgano del documento seleccionado', () => {
    expect(toActiveCaseContext({
      expediente: '1152/2013',
      autoridad: 'TRIBUNAL COLEGIADO DEL SEXTO CIRCUITO',
      actor: 'Ahora 1 A',
      demandado: 'Jesús Ustavo Chávez Lozano',
      materia: 'Laboral',
    })).toEqual({
      expedienteNumber: '1152/2013',
      court: 'TRIBUNAL COLEGIADO DEL SEXTO CIRCUITO',
      actor: 'Ahora 1 A',
      demandado: 'Jesús Ustavo Chávez Lozano',
      matter: 'Laboral',
    });
  });

  it('no inventa contexto cuando la ficha está vacía', () => {
    expect(toActiveCaseContext(null)).toBeNull();
  });
});

describe('indicador de NVIDIA Build', () => {
  it('es verde únicamente cuando la API responde disponible', () => {
    expect(deriveNvidiaIndicator({ provider: 'nvidia', configured: true, available: true })).toEqual({
      tone: 'success',
      label: 'NVIDIA Build Activo',
    });
  });

  it('es rojo cuando la API falla o no está disponible', () => {
    expect(deriveNvidiaIndicator({ provider: 'nvidia', configured: true, available: false })).toEqual({
      tone: 'danger',
      label: 'NVIDIA API no disponible',
    });
    expect(deriveNvidiaIndicator(null)).toEqual({
      tone: 'danger',
      label: 'NVIDIA API no disponible',
    });
    expect(deriveNvidiaIndicator({ provider: 'nvidia', available: true, ok: false })).toEqual({
      tone: 'danger',
      label: 'NVIDIA API no disponible',
    });
  });
});
