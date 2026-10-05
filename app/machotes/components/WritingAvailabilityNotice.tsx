'use client';

import { getFunctionalDocumentTypes, getTypesInDevelopment } from '@/lib/catalog/legalCatalog';

type Tone = 'success' | 'warning' | 'neutral';

/**
 * Traduce el estado técnico del catálogo a lenguaje profesional para el abogado.
 *
 * `functionalStatus` mide la CAPACIDAD TÉCNICA del motor; `humanReview` mide la
 * REVISIÓN JURÍDICA humana. Un tipo `PASS` + `PENDING` NO es un error: está
 * disponible para borrador y pendiente de revisión. Presentarlo como `FAIL` en
 * rojo confunde un estado healthy con una falla.
 */
export function describeWritingAvailability(
  functionalStatus: string,
  humanReview: string,
): { label: string; tone: Tone } {
  const status = String(functionalStatus || '').toUpperCase();
  const review = String(humanReview || '').toUpperCase();
  if (status === 'PASS') {
    return review === 'APPROVED'
      ? { label: 'Acreditado', tone: 'success' }
      : { label: 'Disponible para borrador', tone: 'success' };
  }
  if (status === 'BLOCKED_EXTERNAL') return { label: 'Bloqueado externamente', tone: 'neutral' };
  return review === 'PENDING'
    ? { label: 'Disponible como borrador · Revisión jurídica pendiente', tone: 'warning' }
    : { label: 'En desarrollo (sin certificar)', tone: 'warning' };
}

const TONE_CLASS: Record<Tone, string> = {
  success: 'text-emerald-700',
  warning: 'text-amber-700',
  neutral: 'text-slate-600',
};

export function WritingAvailabilityNotice({
  surface,
  showUncertifiedDrafts = false,
  onShowUncertifiedDraftsChange,
  showTechnicalDetails = false,
}: {
  surface: string;
  showUncertifiedDrafts?: boolean;
  onShowUncertifiedDraftsChange?: (checked: boolean) => void;
  /** Detalle técnico por tipo: sólo en modo desarrollo/debug. */
  showTechnicalDetails?: boolean;
}) {
  const functionalCount = getFunctionalDocumentTypes().length;
  const inDevelopment = getTypesInDevelopment();
  const reviewPending = inDevelopment.length > 0 || functionalCount === 0;

  return (
    <section
      className={`rounded-lg border px-3 py-2.5 text-xs ${reviewPending ? 'border-amber-200 bg-amber-50 text-amber-950' : 'border-emerald-200 bg-emerald-50 text-emerald-950'}`}
      aria-label={`Estado de generación: ${surface}`}
      data-testid={`writing-availability-${surface.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
    >
      <p className="font-semibold">
        Estado: {functionalCount} tipos disponibles para borrador
        {inDevelopment.length > 0 ? `; ${inDevelopment.length} en desarrollo` : ''}.
      </p>
      <p className="mt-1 leading-5">
        Todo tipo disponible genera un borrador sujeto a revisión jurídica profesional.
        La exportación FINAL requiere que el documento concreto supere sus verificaciones.
      </p>
      {onShowUncertifiedDraftsChange && inDevelopment.length > 0 && (
        <label className="mt-2 inline-flex cursor-pointer items-center gap-2 font-semibold">
          <input
            type="checkbox"
            checked={showUncertifiedDrafts}
            onChange={(event) => onShowUncertifiedDraftsChange(event.target.checked)}
            aria-label="En desarrollo (sin certificar)"
          />
          <span>En desarrollo (sin certificar)</span>
        </label>
      )}
      {showUncertifiedDrafts && inDevelopment.length > 0 && (
        <p role="status" className="mt-2 rounded-md border border-amber-300 bg-white px-2.5 py-2 font-bold">
          Borrador asistido: revisión obligatoria. La exportación FINAL seguirá bloqueada.
        </p>
      )}
      {showTechnicalDetails && (
        <details className="mt-1.5" data-testid="writing-types-in-development">
          <summary className="w-fit cursor-pointer font-semibold underline underline-offset-2">
            Detalles técnicos ({inDevelopment.length} en desarrollo)
          </summary>
          <ul className="mt-2 max-h-56 space-y-1 overflow-auto rounded-md border border-slate-200 bg-white p-2" aria-label="Tipos documentales en desarrollo">
            {inDevelopment.map((entry) => {
              const described = describeWritingAvailability(entry.functionalStatus, entry.humanReview);
              return (
                <li key={entry.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-slate-100 py-1 last:border-0">
                  <span><span className="font-semibold">{entry.label}</span> <code className="text-[10px] text-slate-500">{entry.id}</code></span>
                  <span className={`text-[10px] font-bold ${TONE_CLASS[described.tone]}`} data-testid="writing-type-status">{described.label}</span>
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </section>
  );
}
