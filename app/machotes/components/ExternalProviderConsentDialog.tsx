'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';

const PROVIDER_NAMES: Record<string, string> = { gemini: 'Gemini', groq: 'Groq', nvidia: 'NVIDIA' };

type ProviderCheck =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; providers: string[] };

/** Proveedores remotos de la cadena vigente que tienen clave configurada, en el orden en que se intentarán. */
async function loadConfiguredProviders(): Promise<string[]> {
  const response = await fetch('/api/health/providers', { cache: 'no-store' });
  const snapshot = await response.json() as { chain?: string[]; providers?: Array<{ id: string; available: boolean }> };
  const configured = new Set((snapshot.providers || []).filter((item) => item.id !== 'local' && item.available).map((item) => item.id));
  const chain = Array.isArray(snapshot.chain) ? snapshot.chain : [];
  if (!Array.isArray(snapshot.providers)) throw new Error('PROVIDER_STATUS_INVALID');
  return chain.filter((id) => id !== 'local' && configured.has(id));
}

/**
 * Consentimiento explícito antes de enviar contenido del expediente a proveedores externos de IA.
 * Sustituye a `window.confirm`: un diálogo nativo puede cerrarse solo (navegadores embebidos,
 * bloqueadores de diálogos) y la generación quedaba cancelada sin que el abogado lo viera.
 * La decisión se envía al servidor como `externalProviderOptIn` junto con la lista EXACTA de proveedores
 * autorizados (`authorizedExternalProviders`); el backend sigue siendo la barrera y no usa ningún otro.
 */
export function useExternalProviderConsent(): [() => Promise<boolean>, React.ReactNode, () => string[]] {
  const [open, setOpen] = useState(false);
  const resolver = useRef<((value: boolean) => void) | null>(null);
  const authorized = useRef<string[]>([]);

  const request = useCallback(() => new Promise<boolean>((resolve) => {
    resolver.current?.(false);
    resolver.current = resolve;
    authorized.current = [];
    setOpen(true);
  }), []);

  const answer = useCallback((value: boolean, providers: string[] = []) => {
    authorized.current = value ? providers : [];
    resolver.current?.(value);
    resolver.current = null;
    setOpen(false);
  }, []);

  const authorizedProviders = useCallback(() => [...authorized.current], []);

  return [request, open ? <ExternalProviderConsentDialog onAnswer={answer} /> : null, authorizedProviders];
}

function ExternalProviderConsentDialog({ onAnswer }: { onAnswer: (value: boolean, providers?: string[]) => void }) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [check, setCheck] = useState<ProviderCheck>({ status: 'loading' });

  useEffect(() => {
    let disposed = false;
    loadConfiguredProviders()
      .then((providers) => { if (!disposed) setCheck({ status: 'ready', providers }); })
      .catch(() => { if (!disposed) setCheck({ status: 'error' }); });
    return () => { disposed = true; };
  }, []);

  useEffect(() => {
    // El foco inicial va a la opción segura.
    cancelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onAnswer(false); }
      if (event.key === 'Tab' && dialogRef.current) {
        const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled])')];
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onAnswer]);

  const providers = check.status === 'ready' ? check.providers : [];
  const names = providers.map((id) => PROVIDER_NAMES[id] || id);
  const noRemote = check.status === 'ready' && providers.length === 0;

  return <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-900/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onAnswer(false); }}>
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="external-consent-title" aria-describedby="external-consent-body" data-testid="external-provider-consent" className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
      <p className="text-[11px] font-bold uppercase tracking-[.16em] text-[#B58A5A]">Privacidad del expediente</p>
      <h2 id="external-consent-title" className="mt-1 !mb-0 !text-xl !leading-tight font-extrabold text-[#0B2545]">
        {noRemote ? 'No hay IA en la nube configurada' : '¿Autorizas enviar el expediente a un proveedor externo?'}
      </h2>
      <div id="external-consent-body" className="mt-3 space-y-2 text-sm leading-relaxed text-slate-700">
        {check.status === 'loading' && <p aria-live="polite">Comprobando qué proveedores están configurados…</p>}
        {check.status === 'error' && <p role="alert">No se pudo comprobar qué proveedores están configurados. No se enviará nada; vuelve a intentarlo.</p>}
        {noRemote && <p data-testid="external-consent-no-remote">Si continúas, el borrador se arma solo con reglas locales: no se envía nada fuera de este equipo y lo que requiera redacción quedará marcado para tu revisión.</p>}
        {check.status === 'ready' && !noRemote && <>
          <p>Para redactar este borrador se enviará contenido del documento y del expediente a un servicio de IA externo, fuera de este equipo: <strong data-testid="external-consent-providers">{names.join(names.length > 1 ? ', y si no responde, ' : '')}</strong>{names.length > 1 ? ' (en ese orden)' : ''}.</p>
          <ul className="list-disc space-y-1 pl-5 text-xs text-slate-600">
            <li>La autorización vale solo para esta operación y solo para {names.length > 1 ? 'esos proveedores' : 'ese proveedor'}; no se usará ningún otro.</li>
            <li>Al autorizar, el contenido se transmite al proveedor y queda sujeto a sus políticas de uso y conservación de datos.</li>
            <li>Si no autorizas, no se envía nada y la generación no inicia.</li>
            <li>Antes de autorizar, confirma que tienes permiso del cliente para tratar sus datos con terceros.</li>
          </ul>
        </>}
      </div>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button ref={cancelRef} type="button" onClick={() => onAnswer(false)} className="min-h-11 rounded-xl border border-slate-300 px-4 text-sm font-bold text-[#0B2545] hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">No enviar</button>
        <button
          type="button"
          disabled={check.status !== 'ready'}
          onClick={() => onAnswer(true, providers)}
          className="min-h-11 rounded-xl bg-[#0B2545] px-4 text-sm font-bold text-white hover:bg-[#13335c] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {noRemote ? 'Continuar sin enviar' : 'Autorizar esta generación'}
        </button>
      </div>
    </div>
  </div>;
}
