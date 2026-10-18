// @vitest-environment jsdom
import React from 'react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { useExternalProviderConsent } from '@/app/machotes/components/ExternalProviderConsentDialog';

const providersSnapshot = { ok: true, chain: ['groq', 'nvidia', 'gemini', 'local'], providers: [{ id: 'gemini', available: false }, { id: 'groq', available: true }, { id: 'nvidia', available: true }, { id: 'local', available: true }] };
function stubProviders(snapshot: unknown = providersSnapshot, ok = true) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok, json: async () => snapshot })));
}
beforeEach(() => stubProviders());
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

/** Arnés con la misma secuencia que los manejadores de generación: consentir → solo entonces llamar al servidor. */
function Harness({ onGenerate, onBlocked }: { onGenerate: (providers: string[]) => void; onBlocked: () => void }) {
  const [requestConsent, dialog, authorizedProviders] = useExternalProviderConsent();
  return <>
    <button type="button" onClick={async () => { if (await requestConsent()) onGenerate(authorizedProviders()); else onBlocked(); }}>Generar</button>
    {dialog}
  </>;
}

async function clickAndAnswer(answer: (dialog: HTMLElement) => void) {
  const onGenerate = vi.fn();
  const onBlocked = vi.fn();
  render(<Harness onGenerate={onGenerate} onBlocked={onBlocked} />);
  fireEvent.click(screen.getByRole('button', { name: 'Generar' }));
  const dialog = await screen.findByTestId('external-provider-consent');
  // Mientras el panel está abierto no se ha llamado al servidor.
  expect(onGenerate).not.toHaveBeenCalled();
  await act(async () => { answer(dialog); });
  return { onGenerate, onBlocked };
}

describe('panel de consentimiento de proveedores externos', () => {
  it('«No enviar» mantiene bloqueada la generación', async () => {
    const { onGenerate, onBlocked } = await clickAndAnswer(() => fireEvent.click(screen.getByRole('button', { name: 'No enviar' })));
    expect(onGenerate).not.toHaveBeenCalled();
    expect(onBlocked).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('external-provider-consent')).toBeNull();
  });

  it('Escape y clic fuera también cancelan', async () => {
    const esc = await clickAndAnswer(() => fireEvent.keyDown(document, { key: 'Escape' }));
    expect(esc.onGenerate).not.toHaveBeenCalled();
    cleanup();
    const outside = await clickAndAnswer((dialog) => fireEvent.mouseDown(dialog.parentElement!));
    expect(outside.onGenerate).not.toHaveBeenCalled();
  });

  it('el foco inicial está en la opción segura', async () => {
    render(<Harness onGenerate={vi.fn()} onBlocked={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Generar' }));
    await screen.findByTestId('external-provider-consent');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'No enviar' }));
  });

  it('solo «Autorizar esta generación» deja continuar, y solo con los proveedores mostrados', async () => {
    const onGenerate = vi.fn();
    render(<Harness onGenerate={onGenerate} onBlocked={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Generar' }));
    // Nombra a quién y en qué orden se enviará; Gemini (sin clave) no aparece.
    expect((await screen.findByTestId('external-consent-providers')).textContent).toBe('Groq, y si no responde, NVIDIA');
    const dialog = screen.getByTestId('external-provider-consent');
    expect(dialog.textContent).toMatch(/servicio de IA externo/);
    expect(dialog.textContent).toMatch(/queda sujeto a sus políticas de uso y conservación de datos/);
    expect(dialog.textContent).not.toMatch(/no (se )?conserva|nunca (se )?(guarda|conserva)|no almacena/i);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Autorizar esta generación' })); });
    expect(onGenerate).toHaveBeenCalledWith(['groq', 'nvidia']);
  });

  it('si no puede comprobar los proveedores, no permite autorizar', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('sin servidor'); }));
    render(<Harness onGenerate={vi.fn()} onBlocked={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Generar' }));
    expect(await screen.findByText(/No se pudo comprobar qué proveedores están configurados/)).toBeInTheDocument();
    expect((screen.getByRole('button', { name: 'Autorizar esta generación' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('sin proveedores en la nube configurados lo dice y continúa sin enviar nada', async () => {
    stubProviders({ ok: false, chain: ['groq', 'local'], providers: [{ id: 'groq', available: false }, { id: 'local', available: true }] });
    const onGenerate = vi.fn();
    render(<Harness onGenerate={onGenerate} onBlocked={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Generar' }));
    expect(await screen.findByTestId('external-consent-no-remote')).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Continuar sin enviar' })); });
    expect(onGenerate).toHaveBeenCalledWith([]);
  });
});

describe('contrato de la página: consentir antes de cualquier solicitud de generación', () => {
  const page = readFileSync(path.join(process.cwd(), 'app/machotes/page.tsx'), 'utf8');

  it('no queda ningún consentimiento con window.confirm para proveedores', () => {
    expect(page).not.toMatch(/window\.confirm\([^)]*(Gemini|Groq|NVIDIA|proveedor)/i);
  });

  it('cada solicitud a generate / generate-section va precedida por el consentimiento en su manejador', () => {
    const calls = [...page.matchAll(/fetch\('\/api\/legal-engine\/(generate|generate-section)'/g)];
    expect(calls.length).toBeGreaterThanOrEqual(4);
    for (const call of calls) {
      const handlerStart = page.lastIndexOf('const handle', call.index);
      const between = page.slice(handlerStart, call.index);
      expect(between, `fetch en posición ${call.index}`).toMatch(/await requestExternalProviderConsent\(\)/);
      expect(between).toMatch(/if \(!(externalProviderOptIn|sectionExternalProviderOptIn)\)[\s\S]{0,200}return;/);
    }
  });
});
