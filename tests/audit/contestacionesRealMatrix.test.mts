/** Explicit opt-in: one real pipeline invocation per synthetic fixture, no rerolls. */
import { it } from 'vitest';
import { loadEnvConfig } from '@next/env';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { runGenerationPipeline } from '@/lib/legal-engine/pipeline';
import { createSourceDocument } from '@/lib/legal-engine/context';
import { DocumentTemplates, getDocumentTemplate } from '@/lib/legal-engine/documentTemplates';
import { getProviderChain, getNvidiaModel } from '@/lib/ai/providerChain';
import { exportUniversalToDocx } from '@/lib/legal-engine/exportDocxUniversal';
import { exportUniversalToPdf } from '@/lib/legal-engine/exportPdfUniversal';

const enabled = process.env.RUN_CONTESTACIONES_REAL_MATRIX === '1';
it.skipIf(!enabled)('one real generation per supported synthetic matter, with guarded DRAFT exports', async () => {
  loadEnvConfig(process.cwd()); // Read current configuration; never override keys, chain or models.
  const root = resolve('audit/final-contestaciones-validation', `run-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  mkdirSync(root, { recursive: true });
  const save = (path: string, value: unknown) => writeFileSync(path, JSON.stringify(value, null, 2));
  const sha = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
  const supported = Object.values(DocumentTemplates).filter(t => t.tipo.startsWith('contestacion_'));
  save(resolve(root, 'catalog.json'), supported.map(t => ({ type: t.tipo, matter: t.materia, structure: t.estructura })));
  save(resolve(root, 'configuration.json'), {
    providerChain: getProviderChain(), nvidiaModel: getNvidiaModel(),
    geminiModelConfigured: process.env.GEMINI_MODEL || null,
    groqModelConfigured: process.env.GROQ_MODEL || null,
    keysPresent: Object.fromEntries(['GEMINI_API_KEY','GROQ_API_KEY','NVIDIA_API_KEY'].map(k => [k, Boolean(process.env[k])])),
    scope: 'engine integration + guarded file exports; not browser/upload/OCR certification',
    rules: 'one run per fixture; existing gates; no verified authority supplied; no provider overrides',
  });
  const cases = [
    { matter: 'civil', type: 'contestacion_demanda_civil', authority: 'JUZGADO CIVIL SINTETICO DE PRUEBA EN JALISCO', fact: 'La actora afirma que el demandado recibió un préstamo de 10000 pesos el 1 de septiembre de 2026.', claim: 'Pago del préstamo de 10000 pesos.', position: 'Se admite haber recibido el préstamo; se niega el saldo porque se pagó el 15 de septiembre de 2026.', proof: 'Recibo firmado de pago por 10000 pesos de fecha 15 de septiembre de 2026.', request: 'Contestar la demanda civil; oponer pago y solicitar que se desestime exclusivamente el saldo reclamado.' },
    { matter: 'familiar', type: 'contestacion_alimentos', authority: 'JUZGADO FAMILIAR SINTETICO DE PRUEBA EN JALISCO', fact: 'La actora afirma que tiene una hija menor con el demandado y reclama alimentos por 5000 pesos mensuales.', claim: 'Pensión alimenticia de 5000 pesos mensuales.', position: 'Se admite la filiación y la obligación alimentaria; se solicita valoración de capacidad económica, sin negar el derecho de la menor.', proof: 'Acta de nacimiento sintética que acredita la filiación. Recibo de ingresos netos de 12000 pesos mensuales.', request: 'Contestar la demanda de alimentos; aceptar la obligación y pedir fijación proporcional conforme a ingresos acreditados, sin pedir absolución total.' },
    { matter: 'mercantil', type: 'contestacion_demanda_mercantil', authority: 'JUZGADO MERCANTIL SINTETICO DE PRUEBA', fact: 'La actora afirma haber entregado mercancías el 1 de septiembre de 2026 por 20000 pesos conforme a contrato de compraventa mercantil.', claim: 'Pago de 20000 pesos por mercancías.', position: 'Se admite la entrega y el contrato mercantil; se niega el saldo porque se pagó el 15 de septiembre de 2026.', proof: 'Recibo de pago firmado por la actora por 20000 pesos de fecha 15 de septiembre de 2026.', request: 'Contestar la demanda mercantil y oponer pago del saldo; no reconvenir ni impugnar la firma.' },
    { matter: 'laboral', type: 'contestacion_demanda_laboral', authority: 'TRIBUNAL LABORAL SINTETICO FEDERAL DE PRUEBA', fact: 'La actora afirma haber trabajado para la demandada desde el 1 de enero de 2026 y que fue despedida el 15 de septiembre de 2026.', claim: 'Reinstalación por despido injustificado.', position: 'Se admite la relación laboral y la fecha de ingreso; se niega el despido porque la trabajadora continúa en funciones. No se afirma renuncia ni terminación de contrato.', proof: 'Registro de asistencia firmado de fecha 16 de septiembre de 2026.', request: 'Contestar demanda laboral; controvertir exclusivamente el despido y pedir que se valore la continuidad de la relación, sin inventar renuncia.' },
    { matter: 'administrativo', type: 'contestacion_nulidad_administrativa', authority: 'SALA REGIONAL SINTETICA DEL TRIBUNAL FEDERAL DE JUSTICIA ADMINISTRATIVA', fact: 'La actora afirma que una resolución administrativa federal notificada el 15 de septiembre de 2026 carece de firma.', claim: 'Nulidad de la resolución por falta de firma.', position: 'La autoridad demandada niega la falta de firma y exhibe copia firmada; no invoca improcedencia ni hechos distintos.', proof: 'Copia íntegra sintética firmada de la resolución de fecha 1 de septiembre de 2026.', request: 'Contestar demanda de nulidad administrativa, controvertir la ausencia de firma y solicitar que se valore la copia, sin afirmar validez definitiva sin verificación normativa.' },
    { matter: 'constitucional', type: 'contestacion_revision_extraordinaria_amparo_directo', authority: 'TRIBUNAL COLEGIADO SINTETICO DE PRUEBA', fact: 'La sentencia de amparo directo de fecha 15 de septiembre de 2026 negó el amparo por no estudiar el planteamiento constitucional expresamente formulado por el quejoso.', claim: 'Estudio del planteamiento constitucional omitido, sujeto a procedencia extraordinaria por verificar.', position: 'El quejoso sostiene exclusivamente que falta el estudio constitucional; no afirma acreditada la procedencia ni interés excepcional.', proof: 'Copia de sentencia sintética y escrito de demanda con planteamiento constitucional señalado.', request: 'Preparar manifestaciones frente a sentencia de amparo directo y planteamiento extraordinario condicionado; pedir estudio del planteamiento únicamente si se acredita procedencia. No presentar demanda inicial.' },
    { matter: 'fiscal', type: 'contestacion_nulidad_fiscal', authority: 'SALA REGIONAL SINTETICA DEL TRIBUNAL FEDERAL DE JUSTICIA ADMINISTRATIVA', fact: 'La actora sostiene que se le requiere un crédito fiscal de 30000 pesos que ya pagó el 15 de septiembre de 2026.', claim: 'Nulidad del requerimiento de crédito fiscal de 30000 pesos por pago.', position: 'La autoridad demandada admite la existencia del requerimiento; no confirma ni niega el pago hasta cotejar la línea de captura. Solicita cotejo y no presume validez del crédito.', proof: 'Requerimiento sintético y comprobante de pago presentado por la actora pendiente de cotejo.', request: 'Contestar demanda de nulidad fiscal, reconocer el requerimiento y solicitar cotejo del pago; mantener pendiente el punto no confirmado.' },
    { matter: 'agrario', type: 'contestacion_demanda_agraria', authority: 'TRIBUNAL UNITARIO AGRARIO SINTETICO DE PRUEBA', fact: 'La actora reclama restitución de la parcela sintética 101 afirmando ocupación del demandado desde el 1 de septiembre de 2026.', claim: 'Restitución de parcela 101.', position: 'Se niega la ocupación de la parcela 101; el demandado ocupa exclusivamente parcela 102. No se admite titularidad ajena ni se afirma propiedad sin documento.', proof: 'Plano sintético con ubicación de las parcelas 101 y 102 pendiente de valoración.', request: 'Contestar demanda agraria, negar ocupación de parcela 101 y pedir valoración del plano; no reconvenir ni pedir adjudicación.' },
    { matter: 'propiedad_intelectual', type: 'contestacion_impedimento', authority: 'INSTITUTO MEXICANO DE LA PROPIEDAD INDUSTRIAL', fact: 'Un oficio sintético de fecha 15 de septiembre de 2026 pide precisar productos en la solicitud de registro de marca LUNAZUL SINTETICA.', claim: 'Precisar exclusivamente productos objeto de la solicitud.', position: 'La solicitante acepta precisar que los productos son cuadernos de papel; no sostiene reconocimiento de registro ni inexistencia de anterioridades.', proof: 'Oficio sintético y solicitud original de registro para cuadernos de papel.', request: 'Contestar el oficio del IMPI precisando cuadernos de papel; pedir tener por desahogado exclusivamente ese requisito, sin afirmar derecho adquirido al registro.' },
  ];
  const results: unknown[] = [];
  save(resolve(root, 'status.json'), { root, status: 'RUNNING', started: new Date().toISOString() });
  console.log('MATRIX_ROOT', root);
  for (const [index, item] of cases.entries()) {
    const template = getDocumentTemplate(item.type);
    const dir = resolve(root, item.matter);
    mkdirSync(dir);
    const marker = resolve(dir, 'started.json');
    if (existsSync(marker)) throw new Error('NO_REROLL');
    const actor = `ALICIA SINTETICA ${index + 1}`;
    const defendant = `BERNARDO SINTETICO ${index + 1}`;
    const expediente = `SYN-MATRIX-${index + 1}-2026`;
    const special = item.matter === 'constitucional' || item.matter === 'propiedad_intelectual';
    const represented = special ? actor : defendant;
    const capacity = item.matter === 'administrativo' || item.matter === 'fiscal' ? 'representante autorizado de la autoridad demandada mediante nombramiento sintético exhibido' : 'por mi propio derecho';
    const text = [
      'DOCUMENTO Y EXPEDIENTE ENTERAMENTE SINTETICOS PARA PRUEBA. NO USAR EN JUICIO.',
      item.matter === 'constitucional' ? 'SENTENCIA DE AMPARO DIRECTO' : item.matter === 'propiedad_intelectual' ? 'OFICIO DEL IMPI' : `DEMANDA ${item.matter.toUpperCase()}`,
      `EXPEDIENTE: ${expediente}`, `AUTORIDAD: ${item.authority}`,
      `ACTOR: ${actor}`, `DEMANDADO: ${defendant}`, `QUEJOSO: ${special ? actor : 'No aplica'}`,
      `PRESTACIONES\n1. ${item.claim}`, `HECHOS\n1. ${item.fact}`,
      `PRUEBAS\n1. ${item.proof}`, 'FIN DEL DOCUMENTO FUENTE SINTETICO.',
    ].join('\n');
    const instruction = [
      item.request, `Expediente confirmado: ${expediente}. Autoridad destinataria confirmada: ${item.authority}.`,
      `Persona representada confirmada: ${represented}. Personalidad confirmada: ${capacity}.`,
      `Postura del cliente confirmada respecto del hecho 1 y de la prestación 1: ${item.position}`,
      `Prueba ofrecida por el cliente: ${item.proof}`,
      'No inventar hechos, artículos ni jurisprudencia. Ninguna autoridad jurídica está verificada en este fixture. Los puntos de derecho que requieran verificación quedan pendientes. Preparar solamente un borrador para revisión.',
    ].join('\n');
    const source = createSourceDocument({ id: `synthetic-${item.matter}`, filename: `${item.matter}-synthetic.txt`, sourceValidated: true, pages: [{ page: 1, text, chars: text.length }] });
    save(resolve(dir, 'fixture.json'), { ...item, actor, defendant, represented, capacity, expediente, source, sourceHash: sha(text), instruction, templateStructure: template.estructura });
    save(marker, { started: new Date().toISOString(), generationInvocations: 1 });
    console.log('MATRIX_START', item.matter);
    try {
      const doc = await runGenerationPipeline({
        externalProviderOptIn: true, selectedDocumentType: item.type, matter: item.matter,
        jurisdiction: template.jurisdiccion, expediente, userInstruction: instruction,
        sourceDocuments: [source], flow: 'DOCUMENT_ANALYSIS',
        savedParties: [{ role: 'actor', name: actor, source: 'manual' }, { role: 'demandado', name: defendant, source: 'manual' }, ...(special ? [{ role: 'promovente', name: actor, source: 'manual' }] : [])],
        generationId: `matrix-${item.matter}-${Date.now()}`, traceOptions: { enabled: true, outputDir: dir, writeMarkdown: true },
      }, { onTraceReady: (trace, doc) => { save(resolve(dir, 'generation-trace.json'), trace); save(resolve(dir, 'generated-document.json'), doc); } });
      save(resolve(dir, 'generated-document.json'), doc);
      writeFileSync(resolve(dir, 'assembled.txt'), doc.sections.flatMap(s => [s.title, ...s.content.map(b => b.text)]).join('\n\n'));
      const exports: Record<string, unknown> = {};
      for (const format of ['docx', 'pdf']) {
        try {
          const bytes = format === 'docx' ? await exportUniversalToDocx(doc, undefined, undefined, { exportMode: 'DRAFT' }) : await exportUniversalToPdf(doc, undefined, { exportMode: 'DRAFT' });
          if (format === 'pdf' ? bytes.subarray(0, 5).toString() !== '%PDF-' : bytes.subarray(0, 2).toString() !== 'PK') throw new Error('INVALID_FILE_MAGIC');
          writeFileSync(resolve(dir, `draft.${format}`), bytes);
          exports[format] = { status: 'PASS', bytes: bytes.length, sha256: sha(bytes) };
        } catch (error) { exports[format] = { status: 'FAIL', error: String(error) }; }
      }
      const result = { matter: item.matter, type: doc.documentType, status: doc.status, validation: doc.validation, metadata: doc.generationMetadata, exports, finished: new Date().toISOString() };
      save(resolve(dir, 'result.json'), result); results.push({ matter: item.matter, status: doc.status, exports });
    } catch (error) {
      const result = { matter: item.matter, status: 'FAIL', error: String(error), finished: new Date().toISOString() };
      save(resolve(dir, 'result.json'), result); results.push(result);
    }
    save(resolve(root, 'status.json'), { root, status: 'RUNNING', results });
    console.log('MATRIX_FINISH', item.matter);
  }
  save(resolve(root, 'status.json'), { root, status: 'COMPLETED', results, penal: 'NOT_SUPPORTED: no contestacion penal canonical template', finished: new Date().toISOString() });
}, 7_200_000);
