"use client";
import type { ReactNode } from "react";
import { PageHeader } from "../PageHeader";
import { Icon } from "../Icon";
import { Badge, Button, Kbd } from "../ui";

export type LexResult = {
  id: string; rubro: string; registro?: string; organo?: string; extracto?: string;
  badges?: { label: string; tone?: "neutral" | "primary" | "success" | "caution" | "error" }[];
};

/** Investigación jurídica: buscador grande + resultados + rail de filtros/guardados. */
export function InvestigacionView({
  title = "Investigación jurídica", subtitle, query, onQueryChange, onSubmit, loading = false,
  results, onOpen, onCopy, resultsSummary, filtersRail, emptyMessage = "Escribe una consulta para buscar criterios.",
}: {
  title?: string; subtitle?: string; query: string; onQueryChange: (q: string) => void; onSubmit: () => void; loading?: boolean;
  results: LexResult[]; onOpen?: (r: LexResult) => void; onCopy?: (r: LexResult) => void; resultsSummary?: ReactNode;
  filtersRail?: ReactNode; emptyMessage?: string;
}) {
  return (
    <div className="flex w-full flex-col px-5 pb-8">
      <PageHeader title={title} subtitle={subtitle} />
      <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }} className="mb-4 flex items-center gap-2 rounded-xl bg-lex-surface-lowest p-2 shadow-lex-l2">
        <label className="flex h-10 flex-1 items-center rounded-lg bg-lex-surface-low px-3 focus-within:bg-lex-surface-lowest focus-within:shadow-lex-focus">
          <Icon name="travel_explore" size={20} className="mr-2 text-lex-secondary" />
          <input value={query} onChange={(e) => onQueryChange(e.target.value)} placeholder="Buscar tesis, jurisprudencia, rubro o artículo…"
            className="w-full border-none bg-transparent text-lex-body text-lex-on-surface outline-none placeholder:text-lex-secondary" />
          <Kbd>↵</Kbd>
        </label>
        <Button variant="primary" type="submit" disabled={loading} icon={loading ? "hourglass_top" : "search"}>{loading ? "Buscando" : "Buscar"}</Button>
      </form>
      <div className="flex gap-4">
        <div className="min-w-0 flex-1">
          {resultsSummary && <div className="mb-2 text-lex-caption text-lex-secondary">{resultsSummary}</div>}
          {results.length === 0 ? (
            <p className="py-16 text-center text-lex-body text-lex-secondary">{emptyMessage}</p>
          ) : (
            <div className="flex flex-col gap-3">
              {results.map((r) => (
                <article key={r.id} className="rounded-xl bg-lex-surface-lowest p-4 shadow-lex-l2">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    {r.registro && <span className="lex-tabular rounded bg-lex-container-high px-2 py-0.5 font-lex-mono text-lex-mono text-lex-secondary">Reg. {r.registro}</span>}
                    {r.organo && <span className="text-lex-caption text-lex-secondary">{r.organo}</span>}
                    {r.badges?.map((b) => <Badge key={b.label} tone={b.tone}>{b.label}</Badge>)}
                  </div>
                  <h3 className="font-lex-doc text-[15px] font-semibold uppercase leading-snug text-lex-on-surface">{r.rubro}</h3>
                  {r.extracto && <p className="mt-2 line-clamp-4 font-lex-doc text-[14px] italic leading-6 text-lex-on-variant">{r.extracto}</p>}
                  <div className="mt-3 flex items-center gap-1 border-t border-black/[0.06] pt-2">
                    {onOpen && <Button variant="ghost" icon="open_in_new" onClick={() => onOpen(r)}>Abrir</Button>}
                    {onCopy && <Button variant="ghost" icon="content_copy" onClick={() => onCopy(r)}>Copiar rubro</Button>}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
        {filtersRail && <aside className="hidden w-[280px] shrink-0 flex-col gap-3 xl:flex">{filtersRail}</aside>}
      </div>
    </div>
  );
}