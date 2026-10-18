import { expect, test, type Page } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';

/**
 * Verificación EN VIVO de la meta de 40 páginas (2026-10-16). NO es una prueba de regresión:
 * usa un documento real del cliente (copia de banco-de-pruebas.zip) y la IA configurada en el `.env` del servidor
 * aislado (:3201, base y almacenamiento temporales). Sin rutas interceptadas ni fixtures.
 * Solo corre con LIVE_PAGE_TARGET_40=1 y autorización expresa del titular.
 *   LIVE_PAGE_TARGET_40=1 E2E_BASE_URL=http://localhost:3201 npx playwright test -c playwright.phase3.config.ts phase3LivePageTarget40
 */
const LIVE = process.env.LIVE_PAGE_TARGET_40 === '1';
const SOURCE = process.env.LIVE_SOURCE || 'audit/banco-prueba/cases/02/source/DEMANDA LABORAL DE Actor Sintético C4.docx';
const OUT = path.join(process.cwd(), 'audit', 'page-target-40-live', new Date().toISOString().replace(/[:.]/g, '-'));
const EDIT_MARK = 'Nota de revisión del abogado añadida en el editor antes de exportar (verificación de integridad).';

async function shot(page: Page, name: string) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false });
}

test.describe('meta de 40 páginas con la IA configurada (en vivo)', () => {
  test.skip(!LIVE, 'Solo con LIVE_PAGE_TARGET_40=1');
  test.setTimeout(60 * 60_000);

  test('carga, selecciona 40, genera, edita y exporta DOCX/PDF', async ({ page }) => {
    await mkdir(OUT, { recursive: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/machotes?tab=responses_resources');
    await expect(page.getByRole('heading', { name: 'Contestaciones y recursos' })).toBeVisible({ timeout: 60_000 });
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
    await page.locator('input[type="file"]').first().setInputFiles(path.resolve(SOURCE));
    await expect(page.getByTestId('page-target-selector')).toBeVisible({ timeout: 180_000 });
    await page.waitForTimeout(3000);
    await shot(page, '01-cargado');
    await writeFile(path.join(OUT, '01-body.txt'), await page.locator('body').innerText());

    // Ficha del caso, si la pide.
    const requirements = page.getByTestId('requirements-dialog');
    if (await requirements.isVisible().catch(() => false)) {
      await shot(page, '01b-ficha');
    }

    await page.getByTestId('page-target-selector').locator('label', { hasText: 'Extenso' }).click();
    await expect(page.getByRole('radio', { name: /Extenso/ })).toBeChecked();
    await shot(page, '02-extenso');
    const sent: Array<Record<string, unknown>> = [];
    page.on('request', (request) => {
      if (request.url().endsWith('/api/legal-engine/generate') && request.method() === 'POST') sent.push(JSON.parse(request.postData() || '{}'));
    });
    const generate = page.getByRole('button', { name: /^Generar |Revisar datos para continuar/ });
    await writeFile(path.join(OUT, '02-generate-label.txt'), await generate.first().innerText());
    await generate.first().click();
    await page.waitForTimeout(2000);
    await shot(page, '03-tras-generar');
    await writeFile(path.join(OUT, '03-body.txt'), await page.locator('body').innerText());
    const consent = page.getByTestId('external-provider-consent');
    if (await consent.isVisible().catch(() => false)) {
      await consent.getByRole('button', { name: 'Autorizar esta generación' }).click();
    }
    await expect.poll(() => sent.length, { timeout: 60_000 }).toBeGreaterThan(0);
    await writeFile(path.join(OUT, 'request.json'), JSON.stringify({ ...sent[0], sourceDocuments: undefined }, null, 2).slice(0, 20000));
    expect((sent[0] as { pageTarget?: unknown }).pageTarget).toEqual({ preset: 'EXTENSO', pages: 40 });

    // Generación real: puede tardar muchos minutos.
    await expect(page.getByTestId('page-target-result')).toBeVisible({ timeout: 55 * 60_000 });
    const resultText = await page.getByTestId('page-target-result').innerText();
    await writeFile(path.join(OUT, '04-result.txt'), resultText);
    await shot(page, '04-editor');

    // Edición en el editor: añadir una nota al final del primer bloque editable.
    const editable = page.locator('[contenteditable="true"]').first();
    await editable.click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type(` ${EDIT_MARK}`);
    await page.waitForTimeout(1500);
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.waitForTimeout(2500);
    await writeFile(path.join(OUT, '05-editor-text.txt'), await page.locator('[contenteditable="true"]').allInnerTexts().then((all) => all.join('\n\n')));

    const toolbar = page.locator('button[title="Elegir exportación de borrador o final"]');
    await toolbar.click();
    const docxPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /DOCX borrador$/ }).click();
    const docxPath = path.join(OUT, 'export.docx');
    await (await docxPromise).saveAs(docxPath);
    await toolbar.click();
    const pdfPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /PDF borrador$/ }).click();
    const pdfPath = path.join(OUT, 'export.pdf');
    await (await pdfPromise).saveAs(pdfPath);

    const docxText = (await mammoth.extractRawText({ buffer: await readFile(docxPath) })).value;
    await writeFile(path.join(OUT, 'export-docx.txt'), docxText);
    const parser = new PDFParse({ data: await readFile(pdfPath) });
    const parsed = await parser.getText();
    await parser.destroy();
    await writeFile(path.join(OUT, 'export-pdf.txt'), parsed.text);
    const pdfPages = (parsed as { total?: number; pages?: unknown[] }).total ?? (parsed as { pages?: unknown[] }).pages?.length;
    await writeFile(path.join(OUT, 'summary.json'), JSON.stringify({ resultText, pdfPages, docxChars: docxText.length, pdfChars: parsed.text.length,
      editInDocx: docxText.includes(EDIT_MARK), editInPdf: parsed.text.replace(/\s+/g, ' ').includes(EDIT_MARK) }, null, 2));
    expect(docxText).toContain(EDIT_MARK);
  });
});
