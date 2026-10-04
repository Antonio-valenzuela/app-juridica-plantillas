'use client';
import React from 'react';
import type { AppealCandidateReview } from '@/lib/legal-engine/case-extraction/appealReasoningCandidates';
const impactLabel: Record<string, string> = { ADVERSE: 'adverso', BENEFICIAL: 'favorable', NEUTRAL: 'neutral', UNDETERMINED: 'indeterminado', MIXED: 'mixto' };
export function AppealReasoningCandidatesPanel({ review }: { review: AppealCandidateReview }) {
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
