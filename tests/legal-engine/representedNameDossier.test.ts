import { describe, expect, it } from 'vitest';
import { buildCaseDossier, confirmDossier, parseCaseDossier, validateDossierForContract } from '@/lib/legal-engine/caseDossier';
import { getWritingContract } from '@/lib/legal-engine/writingContract';
import { sentenciaVersionPublica } from '../fixtures/sentenciaAmparoDirectoSintetica';

const source = sentenciaVersionPublica();
const contract = getWritingContract('recurso_revision_amparo_directo');
const confirmedAs = (name: string) => confirmDossier(buildCaseDossier([source]), { representedName: name, representedSide: 'otro' });
const problemCodes = (name: string) => validateDossierForContract(confirmedAs(name), contract, [source]).map((problem) => problem.code);

describe('nombre de la parte representada: rechazo del lado servidor', () => {
  it('el tipo exige representación', () => {
    expect(contract.needsRepresentation).toBe(true);
  });

  it.each(['xcxc', 'aaa', '123', 'ab'])('validateDossierForContract rechaza «%s»', (name) => {
    expect(problemCodes(name)).toContain('REPRESENTATION_NAME_INVALID');
  });

  it.each(['IMSS', 'María López Pérez'])('validateDossierForContract no rechaza «%s» por su nombre', (name) => {
    expect(problemCodes(name)).not.toContain('REPRESENTATION_NAME_INVALID');
  });

  it('parseCaseDossier descarta una ficha cuyo nombre es inválido (la petición no puede saltarse el diálogo)', () => {
    const wire = (name: string) => JSON.parse(JSON.stringify(confirmedAs(name)));
    expect(parseCaseDossier(wire('xcxc'))).toBeNull();
    expect(parseCaseDossier(wire('aaa'))).toBeNull();
    expect(parseCaseDossier(wire('IMSS'))).toMatchObject({ confirmed: true, representedName: 'IMSS' });
  });
});
