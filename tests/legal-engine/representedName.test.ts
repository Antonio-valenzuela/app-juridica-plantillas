import { describe, expect, it } from 'vitest';
import { REPRESENTED_NAME_INVALID_MESSAGE, validateRepresentedName } from '@/lib/legal-engine/representedName';

describe('validateRepresentedName', () => {
  it.each([
    ['', 'EMPTY'],
    ['   ', 'EMPTY'],
    ['ab', 'TOO_SHORT'],
    ['123', 'NO_LETTERS'],
    ['...', 'NO_LETTERS'],
    ['aaa', 'REPEATED_CHAR'],
    ['xxxx', 'REPEATED_CHAR'],
    ['xcxc', 'REPEATED_BLOCK'],
    ['abab', 'REPEATED_BLOCK'],
  ])('bloquea «%s» (%s) con un mensaje único', (input, code) => {
    expect(validateRepresentedName(input)).toEqual({ ok: false, code, message: REPRESENTED_NAME_INVALID_MESSAGE });
  });

  it.each(['IMSS', 'SAT', 'CFE', 'Ana', 'María López Pérez', 'Ayuntamiento de Zapopan'])('acepta «%s»', (input) => {
    expect(validateRepresentedName(input)).toEqual({ ok: true });
  });

  it.each([
    'Iñaki Núñez',
    'José Ángel Muñoz',
    "D'Angelo",
    'Pérez-Gil',
    'Comercializadora del Bajío, S.A. de C.V.',
    '3M México',
  ])('acepta el nombre legítimo «%s»', (input) => {
    expect(validateRepresentedName(input)).toEqual({ ok: true });
  });

  it('reconoce letras Unicode (ñ, acentos), no solo a-z', () => {
    // Con una regla a-z, «ÑÑÑ» no tendría letras (NO_LETTERS); con \p{L} es un mismo carácter repetido.
    expect(validateRepresentedName('ÑÑÑ')).toMatchObject({ ok: false, code: 'REPEATED_CHAR' });
    expect(validateRepresentedName('ñññ')).toMatchObject({ ok: false, code: 'REPEATED_CHAR' });
    expect(validateRepresentedName('Ñandú')).toEqual({ ok: true });
  });

  it('el bloque repetido solo bloquea una palabra de 8 letras o menos', () => {
    expect(validateRepresentedName('xcxcxcxc')).toMatchObject({ ok: false, code: 'REPEATED_BLOCK' });
    expect(validateRepresentedName('xcxcxcxcxc')).toEqual({ ok: true });
    expect(validateRepresentedName('xc xc')).toEqual({ ok: true });
  });

  it('avisa sin bloquear cuando no coincide con ninguna parte detectada', () => {
    const result = validateRepresentedName('María López Pérez', ['JUAN PÉREZ SINTÉTICO']);
    expect(result).toMatchObject({ ok: true, warning: { code: 'NOT_A_DETECTED_PARTY' } });
  });

  it('no avisa cuando coincide (sin importar mayúsculas ni acentos) ni cuando no hay partes detectadas', () => {
    expect(validateRepresentedName('juan perez', ['JUAN PÉREZ SINTÉTICO'])).toEqual({ ok: true });
    expect(validateRepresentedName('María López Pérez', [])).toEqual({ ok: true });
  });

  it('un nombre inválido sigue bloqueado aunque haya partes detectadas', () => {
    expect(validateRepresentedName('xcxc', ['JUAN PÉREZ SINTÉTICO'])).toMatchObject({ ok: false, code: 'REPEATED_BLOCK' });
  });

  it('tolera valores no textuales', () => {
    expect(validateRepresentedName(undefined)).toMatchObject({ ok: false, code: 'EMPTY' });
    expect(validateRepresentedName(null)).toMatchObject({ ok: false, code: 'EMPTY' });
  });
});
