import { describe, expect, it } from 'vitest';
import {
  buildCarryoverBlocklist,
  filterCarryoverText,
  findCarryover,
} from '@/lib/templates/carryoverFilter';

const template = `JUZGADO PRIMERO CIVIL DE GUADALAJARA
EXPEDIENTE: 345/2022

C. Juan Pérez, por mi propio derecho, comparezco ante usted.

HECHOS
1. El 18 de agosto de 2021 Juan Pérez celebró contrato con la demandada por la cantidad de $85,000.00.
2. Domicilio: Calle Hidalgo número 120, Colonia Centro, C.P. 44100. Tel 33 1234 5678, juan@correo.com.

PRUEBAS
Prueba 3: contrato de arrendamiento firmado.

PROTESTO LO NECESARIO
`;

const caso = ['María López', 'Constructora Norte', '995/2099', 'Juzgado de Prueba', '3 de marzo de 2026'];

describe('filtro anti-arrastre', () => {
  const blocklist = buildCarryoverBlocklist(template, caso);

  it('bloquea persona, expediente y monto de la plantilla anterior', () => {
    const generated = [
      'Juan Pérez reclama el pago.',
      'Se tramita en el expediente 345/2022.',
      'Se reclama la suma de 85000 pesos.',
    ];
    for (const text of generated) expect(findCarryover(text, blocklist).length, text).toBeGreaterThan(0);
  });

  it('el resultado filtrado no deja ninguno de los datos viejos', () => {
    const generated = [
      'Comparezco María López, por mi propio derecho.',
      'El 18 de agosto de 2021, Juan Pérez firmó con la demandada por $85,000.',
      'Conforme al expediente 345/2022 se acredita el adeudo.',
      'Ubicado en Calle Hidalgo número 120.',
      'La demandada Constructora Norte incumplió el contrato.',
      'Prueba 3: contrato de arrendamiento firmado.',
      'Localizable en juan@correo.com o 3312345678.',
      'PROTESTO LO NECESARIO.',
    ].join('\n\n');
    const { text, blocked } = filterCarryoverText(generated, blocklist);
    for (const old of ['Juan Pérez', '345/2022', '85,000', '85000', 'Hidalgo', 'juan@correo.com', '3312345678', 'Prueba 3', '18 de agosto de 2021']) {
      expect(text).not.toContain(old);
    }
    expect(text).toContain('Comparezco María López');
    expect(text).toContain('Constructora Norte');
    expect(text).toContain('PROTESTO LO NECESARIO');
    expect(blocked.length).toBe(5);
  });

  it('reconoce formatos equivalentes de monto y fecha', () => {
    expect(findCarryover('pagó $85,000.00 M.N.', blocklist).some((h) => h.kind === 'monto')).toBe(true);
    expect(findCarryover('el 18/08/2021 se firmó', blocklist).some((h) => h.kind === 'fecha')).toBe(true);
  });

  it('no bloquea lo que el caso nuevo comparte ni datos legítimos nuevos', () => {
    const shared = buildCarryoverBlocklist(template, ['Juan Pérez', 'Juzgado Primero Civil de Guadalajara', '345/2022']);
    expect(findCarryover('Juan Pérez comparece en el expediente 345/2022.', shared)).toEqual([]);
    expect(findCarryover('Expediente 995/2099, el 3 de marzo de 2026, por $12,500.', blocklist)).toEqual([]);
    expect(findCarryover('Conforme al artículo 2398 del Código Civil.', blocklist)).toEqual([]);
  });

  it('con plantilla sin datos propios no bloquea nada', () => {
    const empty = buildCarryoverBlocklist('HECHOS\nPROTESTO LO NECESARIO', caso);
    expect(empty.entities).toEqual([]);
  });
});
