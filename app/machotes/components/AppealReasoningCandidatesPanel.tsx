'use client';
import React, { useState } from 'react';
import type { AppealCandidateReview } from '@/lib/legal-engine/case-extraction/appealReasoningCandidates';
import type { AppealAiClassification } from '@/lib/legal-engine/case-extraction/appealReasoningAiClassification';
const impactLabel: Record<string, string> = { ADVERSE: 'adverso', BENEFICIAL: 'favorable', NEUTRAL: 'neutral', UNDETERMINED: 'indeterminado', MIXED: 'mixto' };
export function AppealReasoningCandidatesPanel({ review, classifications = [] }: { review: AppealCandidateReview; classifications?: AppealAiClassification[] }) {
  const classificationByBlock = new Map(classifications.map(item => [item.blockId, item]));
  const reasoningBlocks = review.blocks.filter(block => block.kind === 'REASONING');
  return <section aria-label="Agravios candidatos" className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
    <h3 className="font-semibold">Razonamientos y agravios candidatos</h3>
    <p className="text-sm text-slate-600">Solo lectura. Son puntos para revisión del abogado, no agravios aprobados ni fundamento jurídico verificado.</p>
    <p className="text-xs text-slate-500">{review.reasonings.length} razonamientos · {review.candidates.length} candidatos · {review.reasonings.filter(r => r.impact === 'UNDETERMINED').length} con afectación no determinada.</p>
    <div aria-label="Resultado global" className="rounded-lg bg-slate-50 p-3 space-y-2">
      <p className="font-medium">Resultado global: {impactLabel[review.globalOutcome.impact]} para la representación confirmada.</p>
      <p className="text-xs text-slate-600">Regla {review.globalOutcome.appliedRule}: {review.globalOutcome.classificationReason}</p>
    {review.globalOutcome.findings.map((finding, i) => <div key={`${finding.origin.page}:${finding.origin.start}:${i}`}>
        <p data-testid="appeal-global-outcome-page" className="text-xs text-slate-500">Página {finding.origin.page} · impacto {impactLabel[finding.impact]}</p>
        <blockquote className="whitespace-pre-wrap text-sm border-l-2 pl-3">{finding.origin.excerpt}</blockquote>
      </div>)}
    </div>
    <section aria-label="Clasificación por bloque" className="space-y-2">
      <h4 className="text-sm font-semibold">Razonamientos por bloque</h4>
      {reasoningBlocks.map(block => {
        const classification = classificationByBlock.get(block.id);
        const impact = classification?.impact ?? block.impact;
        const reason = classification?.classificationReason ?? block.classificationReason;
        const label = classification?.status === 'AI_VALIDATED' ? 'IA · cita validada'
          : classification?.status === 'INDETERMINATE' ? 'Indeterminado · revisión necesaria'
            : classification?.status === 'DETERMINISTIC_FALLBACK' ? 'Respaldo determinístico'
              : 'Clasificación determinística inicial';
        return <article key={block.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-1">
          <p className="text-xs text-slate-600">{block.section} · {block.pages.length ? `Página${block.pages.length === 1 ? '' : 's'} ${block.pages.join(', ')}` : `Página ${block.origin.page}`} · {label}</p>
          {block.ocrReadingDoubtful && <p className="text-xs text-amber-800">Lectura OCR dudosa: “{block.section}” podría corresponder a “{block.canonicalSection}”; se conserva el texto fuente original.</p>}
          <p className="text-sm font-medium">Afectación: {impactLabel[impact]}</p>
          <p className="text-xs text-slate-700">Regla {classification?.appliedRule ?? block.appliedRule}: {reason}</p>
          {classification?.citationValidated && classification.validatedQuote
            ? <blockquote className="whitespace-pre-wrap border-l-2 border-blue-400 pl-3 text-sm">Cita OCR original validada · Página {classification.validatedCitation?.page ?? block.pages[0]}: {classification.validatedQuote}</blockquote>
            : block.decisionOrigins.map((origin, index) => <blockquote key={`${origin.page}:${origin.start}:${index}`} className="whitespace-pre-wrap border-l-2 pl-3 text-sm">Fragmento original extraído: {origin.excerpt} · Página {origin.page}</blockquote>)}
          {classification?.warning && <p className="text-xs text-amber-800">{classification.warning}</p>}
        </article>;
      })}
      {!reasoningBlocks.length && <p className="text-sm text-slate-600">No se identificaron bloques de razonamiento en la resolución seleccionada.</p>}
    </section>
    <p className="text-xs text-slate-500">Etiquetas: «con soporte en autos» exige constancia comprobada; «sin soporte» señala soporte pendiente; «débil» señala una objeción que la resolución ya responde. Esta fase no verifica autoridades ni constancias independientes.</p>
    {!review.candidates.length && <p>No se identificó un perjuicio atribuible con suficiente claridad para proponer candidatos. Revisa los razonamientos y la representación.</p>}
    {review.candidates.map(c => <article key={c.id} className="rounded-lg border border-slate-200 p-3 space-y-2">
      <p className="text-xs text-slate-500">{c.section} · Página {c.origin.page}</p>
      <p className="text-sm font-medium">Decisión del juez: {c.judgeDecision}</p>
      <blockquote className="whitespace-pre-wrap text-sm border-l-2 pl-3">{c.decisionOrigin.excerpt}</blockquote>
      <p className="text-xs text-slate-600">Regla {c.appliedRule}: {c.classificationReason}</p>
      <p className="text-xs">Posible perjuicio para: {c.affectedNames.join('; ')}. A confirmar jurídicamente.</p>
      <p className="text-sm">{c.proposedReview}</p>
      <div className="flex gap-2 text-xs"><span className="rounded bg-amber-50 px-2 py-1">{c.legalSupport}</span>{c.weakness && <span className="rounded bg-orange-50 px-2 py-1">{c.weakness}</span>}</div>
      {c.weaknessReason && <p className="text-xs text-amber-800">{c.weaknessReason}</p>}
      {c.authorities.map((a, i) => <p key={i} className="text-xs">Cita atribuida al juez — SOURCE_CITED, no verificada: {a.text} · Página {a.origin.page}</p>)}
    </article>)}
    <details className="text-sm"><summary>Razonamientos y atribuciones extraídas</summary>{review.reasonings.map(r => <div key={r.id} className="my-3"><p>Página {r.decisionOrigin.page} · {r.section} · {r.impact === 'BENEFICIAL' ? 'Beneficia a la parte representada: no se propone agravio' : r.impact === 'ADVERSE' ? 'Posible afectación' : r.impact === 'NEUTRAL' ? 'Neutral / encuadre' : 'Afectación no determinada'}</p><p className="text-xs text-slate-600">Regla {r.appliedRule}: {r.classificationReason}</p><blockquote className="whitespace-pre-wrap border-l-2 pl-3">{r.decisionOrigin.excerpt}</blockquote></div>)}{review.statements.map(s => <p key={s.id} className="my-2">Página {s.origin.page} · {s.kind === 'ALLEGATION' ? 'Alegación' : s.kind === 'RECORD_REFERENCE' ? 'Referencia a constancia' : 'Hecho tenido por acreditado por el juez (atribución)'}: {s.origin.excerpt}</p>)}</details>
    {review.warnings.map((w, i) => <p className="text-xs text-amber-800" key={i}>{w}</p>)}
  </section>;
}

export function AppealReasoningAiReview({ review }: { review: AppealCandidateReview }) {
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [classifications, setClassifications] = useState<AppealAiClassification[]>([]);
  const [warning, setWarning] = useState('');

  const classify = async () => {
    if (!consent || !review.representedRole || !review.representedNames.length) return;
    setLoading(true);
    setWarning('');
    try {
      const response = await fetch('/api/legal-engine/appeal/reasoning-classification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentType: review.documentType,
          resolutionId: review.resolutionId,
          representedRole: review.representedRole,
          representedNames: review.representedNames,
          globalOutcome: review.globalOutcome,
          externalProviderOptIn: true,
          blocks: review.blocks.filter(block => block.kind === 'REASONING').map(block => ({
            id: block.id, resolutionId: block.resolutionId, section: block.section, kind: block.kind,
            pages: block.pages, sourceText: block.sourceText, sourceSpans: block.sourceSpans,
            fallback: { impact: block.impact, appliedRule: block.appliedRule, classificationReason: block.classificationReason },
          })),
        }),
      });
      const payload = await response.json();
      if (!response.ok || payload.ok !== true || !Array.isArray(payload.classifications)) throw new Error('No se obtuvo una clasificación válida.');
      setClassifications(payload.classifications as AppealAiClassification[]);
      setWarning(Array.isArray(payload.warnings) ? payload.warnings.join(' ') : '');
    } catch {
      setClassifications([]);
      setWarning('No se pudo completar la clasificación asistida. Se muestran únicamente los resultados determinísticos; no se reporta uso de IA.');
    } finally {
      setLoading(false);
    }
  };

  return <div className="space-y-3">
    <section aria-label="Clasificación asistida" className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
      <p className="text-sm font-medium">Clasificación asistida de razonamientos</p>
      <label className="flex items-start gap-2 text-xs text-slate-600">
        <input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} />
        <span>Autorizo enviar los bloques de razonamiento y la parte representada al proveedor configurado para esta clasificación. Las citas se validarán contra el texto original.</span>
      </label>
      <button type="button" onClick={classify} disabled={!consent || loading || !review.blocks.some(block => block.kind === 'REASONING')}
        className="rounded-md bg-slate-900 px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50">
        {loading ? 'Clasificando…' : 'Clasificar razonamientos'}
      </button>
      {warning && <p role="status" className="text-xs text-amber-800">{warning}</p>}
    </section>
    <AppealReasoningCandidatesPanel review={review} classifications={classifications} />
  </div>;
}
