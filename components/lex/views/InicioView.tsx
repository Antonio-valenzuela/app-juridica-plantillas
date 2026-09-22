import type { ReactNode } from "react";
import { PageHeader } from "../PageHeader";
import { Timeline, type LexTimelineEvent } from "../Panels";

/** Inicio: métricas, línea de tiempo procesal y tarjetas laterales. Todo por slots/props. */
export function InicioView({
  title = "Inicio", subtitle, headerActions, stats, timelineTitle = "Línea de tiempo procesal", events, timelineEmpty, rail, main,
}: {
  title?: string; subtitle?: string; headerActions?: ReactNode; stats?: ReactNode;
  timelineTitle?: string; events?: LexTimelineEvent[]; timelineEmpty?: string; rail?: ReactNode; main?: ReactNode;
}) {
  return (
    <div className="flex w-full flex-col px-5 pb-8">
      <PageHeader title={title} subtitle={subtitle} actions={headerActions} />
      {stats && <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">{stats}</div>}
      <div className="flex gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {main}
          {events && (
            <section className="rounded-xl bg-lex-surface-lowest p-5 shadow-lex-l2">
              <h2 className="mb-4 text-lex-section text-lex-on-surface">{timelineTitle}</h2>
              <Timeline events={events} emptyMessage={timelineEmpty} />
            </section>
          )}
        </div>
        {rail && <aside className="hidden w-[320px] shrink-0 flex-col gap-3 xl:flex">{rail}</aside>}
      </div>
    </div>
  );
}