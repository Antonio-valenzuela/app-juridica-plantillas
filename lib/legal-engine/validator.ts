import { UniversalLegalDocument, ValidationResult, ValidationCheck, ValidationIssue } from './types';
import { hasUnresolvedFieldMarkers } from './pendingFields';

function addCheck(
  id: string,
  severity: 'error' | 'warning',
  message: string,
  evaluate: (doc: UniversalLegalDocument) => boolean
): ValidationCheck {
  return { id, severity, message, evaluate };
}

const CHECKS: ValidationCheck[] = [
  // Guardas defensivas (?.): documentos legacy de BD o payloads externos pueden
  // carecer de parties/caseRefs/variables sin que la validación deba lanzar.
  addCheck('doc_type', 'error', 'El documento no tiene un tipo definido.', doc => !!doc.documentType && doc.documentType !== 'unknown'),
  addCheck('has_content', 'error', 'El documento no tiene secciones o contenido.', doc => (doc.sections || []).length > 0),
  addCheck('has_petition', 'error', 'El documento no contiene puntos petitorios.', doc => (doc.sections || []).some(s => s.type === 'petition')),
  addCheck('has_authority', 'warning', 'No se ha especificado la autoridad a la que se dirige.', doc => !!doc.parties?.autoridadResponsable || !!doc.classification?.authority),
  addCheck('has_expediente', 'warning', 'No se ha especificado el número de expediente.', doc => !!doc.caseRefs?.expediente || !!doc.caseRefs?.amparo || !!doc.caseRefs?.toca),
  addCheck('has_parties', 'warning', 'No se han identificado las partes principales.', doc => !!doc.parties?.actor || !!doc.parties?.quejoso || !!doc.parties?.demandado),
  addCheck('variables_resolved', 'warning', 'Existen variables requeridas sin resolver.', doc => !Object.values(doc.variables || {}).some((v: any) => v.isRequired && !v.value)),
  addCheck('has_signature', 'warning', 'El documento no tiene sección de firma.', doc => (doc.sections || []).some(s => s.type === 'signature')),
  addCheck(
    'no_pending_data',
    'warning',
    'Hay datos pendientes o anonimizados en el documento.',
    doc => !(doc.missingFields?.length || doc.anonymizedFields?.length)
      && !(doc.sections || []).some(s => s.content.some(c => hasUnresolvedFieldMarkers(c.text))),
  ),
  addCheck('no_unverified', 'warning', 'Existen bloques de contenido no verificados.', doc => !(doc.sections || []).some(s => s.content.some(c => c.trust === 'UNVERIFIED')))
];

export function validateDocument(doc: UniversalLegalDocument): ValidationResult {
  const result: ValidationResult = {
    isValid: true,
    canExport: true,
    errors: [],
    warnings: [],
    checks: []
  };

  CHECKS.forEach(check => {
    if (!check.evaluate(doc)) {
      const issue: ValidationIssue = {
        checkId: check.id,
        message: check.message
      };
      
      if (check.severity === 'error') {
        result.isValid = false;
        result.canExport = false;
        result.errors.push(issue);
      } else {
        result.warnings.push(issue);
      }
    }
  });

  return result;
}
