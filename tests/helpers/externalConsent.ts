import type { Page } from '@playwright/test';

/**
 * Equivalente al antiguo `page.once('dialog', d => d.accept())` para el panel de consentimiento
 * de proveedores externos: espera el panel en segundo plano, comprueba su aviso y autoriza.
 * Las pruebas solo simulan la generación (rutas interceptadas); nunca llega a un proveedor real.
 * El servidor aislado de E2E no tiene claves: el panel lo dice y ofrece «Continuar sin enviar».
 */
export function acceptExternalConsentOnce(page: Page, timeout = 30_000): Promise<void> {
  const dialog = page.getByTestId('external-provider-consent');
  return (async () => {
    await dialog.waitFor({ state: 'visible', timeout });
    const authorize = dialog.getByRole('button', { name: /^(Autorizar esta generación|Continuar sin enviar)$/ });
    await authorize.and(page.locator(':enabled')).waitFor({ state: 'visible', timeout });
    const text = await dialog.innerText();
    if (!/servicio de IA externo|no se envía nada fuera de este equipo/.test(text)) throw new Error(`Aviso de consentimiento inesperado: ${text.slice(0, 120)}`);
    await authorize.click();
  })().catch(() => { /* Si no aparece (p. ej. la generación no inicia), la propia prueba lo detecta. */ });
}

/** Responde «No enviar» al panel: la operación remota debe quedar bloqueada. */
export function declineExternalConsentOnce(page: Page, timeout = 30_000): Promise<void> {
  const dialog = page.getByTestId('external-provider-consent');
  return (async () => {
    await dialog.waitFor({ state: 'visible', timeout });
    await dialog.getByRole('button', { name: 'No enviar' }).click();
  })().catch(() => { /* la prueba verifica el resultado */ });
}
