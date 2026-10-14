import { describe, expect, it } from 'vitest';
import { buildCaseDossier, confirmDossier, parseCaseDossier } from '@/lib/legal-engine/caseDossier';
import { expedienteApelacion } from '../fixtures/apelacionContrariaSintetica';

describe('ficha del caso recibida del cliente', () => {
  const confirmed = () => confirmDossier(buildCaseDossier([expedienteApelacion()]), { representedName: 'CONSTRUCTORA LOS OLIVOS FICTICIA, S.A. DE C.V.', representedSide: 'demandado' });

  it('conserva una ficha válida tras serializarla', () => {
    const original = confirmed();
    const parsed = parseCaseDossier(JSON.parse(JSON.stringify(original)));
    expect(parsed).toMatchObject({
      court: original.court, expediente: original.expediente, representedName: original.representedName,
      representedSide: 'demandado', confirmed: true, sourceFingerprint: original.sourceFingerprint,
    });
    expect(parsed!.agravios.map((item) => item.number)).toEqual([1, 2, 3]);
  });

  it.each([null, undefined, 'texto', 42, {}, { version: 2, sourceFingerprint: 'x' }, { version: 1 }])('rechaza una ficha sin forma válida (%j)', (input) => {
    expect(parseCaseDossier(input)).toBeNull();
  });

  it('acota tipos y descarta entradas inválidas en lugar de confiar en el cliente', () => {
    const hostile = { ...confirmed(), court: 'x'.repeat(5000), confirmed: 'sí', representedSide: 'cualquiera', parties: [{ name: '' }, { name: 'Parte', role: 'raro' }], agravios: [{ number: 'uno', text: 'a' }] };
    const parsed = parseCaseDossier(hostile)!;
    expect(parsed.court.length).toBeLessThanOrEqual(500);
    expect(parsed.confirmed).toBe(false);
    expect(parsed.representedSide).toBeUndefined();
    expect(parsed.parties).toEqual([{ name: 'Parte', role: 'otro' }]);
    expect(parsed.agravios).toEqual([]);
  });
});
