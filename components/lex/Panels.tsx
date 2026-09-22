"use client";
import { useState, type ReactNode } from "react";
import { Icon } from "./Icon";

/** Sección colapsable del inspector (label 11px uppercase + chevron). */
export function InspectorSection({ title, defaultOpen = true, children }: { title: string; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="mb-4">
      <button onClick={() => setOpen((o) => !o)} className="mb-2 flex w-full items-center gap-1 text-left">
        <Icon name={open ? "expand_more" : "chevron_right"} size={16} className="text-lex-secondary" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-lex-secondary">{title}</span>
      </button>
      {open && <div className="flex flex-col gap-2">{children}</div>}
    </section>
  );
}

/** Tarjeta lateral (guía, criterio destacado, aviso). */
export function SidePanelCard({ title, icon, children, footer }: { title: string; icon?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="rounded-xl bg-lex-surface-lowest p-4 shadow-lex-l2">
      <div className="mb-2 flex items-center gap-2">
        {icon && <Icon name={icon} size={18} className="text-lex-primary" />}
        <h3 className="text-lex-heading text-lex-on-surface">{title}</h3>
      </div>
      <div className="text-lex-meta text-lex-secondary">{children}</div>
      {footer && <div className="mt-3 border-t border-black/[0.06] pt-2">{footer}</div>}
    </div>
  );
}

/** Pestañas tipo segmented (Documento / Actuaciones / …). */
export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: string; icon?: string }[] }) {
  return (
    <div role="tablist" className="inline-flex rounded-lg bg-lex-container p-0.5">
      {tabs.map((t) => (
        <button key={t.value} role="tab" aria-selected={t.value === value} onClick={() => onChange(t.value)}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-lex-caption transition-colors ${t.value === value ? "bg-lex-surface-lowest font-medium text-lex-on-surface shadow-sm" : "text-lex-secondary hover:text-lex-on-surface"}`}>
          {t.icon && <Icon name={t.icon} size={16} />}{t.label}
        </button>
      ))}
    </div>
  );
}

/** Línea de tiempo procesal. */
export type LexTimelineEvent = { id: string; date: string; title: string; description?: string; tone?: "neutral" | "error" | "success" | "caution" };
const dot = { neutral: "bg-lex-outline", error: "bg-lex-primary-container", success: "bg-lex-success", caution: "bg-lex-caution" } as const;

export function Timeline({ events, emptyMessage = "Sin actuaciones." }: { events: LexTimelineEvent[]; emptyMessage?: string }) {
  if (events.length === 0) return <p className="py-6 text-center text-lex-body text-lex-secondary">{emptyMessage}</p>;
  return (
    <ol className="relative flex flex-col gap-4 border-l border-lex-variant pl-5">
      {events.map((e) => (
        <li key={e.id} className="relative">
          <span className={`absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-lex-surface ${dot[e.tone ?? "neutral"]}`} />
          <div className="lex-tabular font-lex-mono text-lex-mono text-lex-secondary">{e.date}</div>
          <div className="text-lex-body-strong text-lex-on-surface">{e.title}</div>
          {e.description && <div className="text-lex-meta text-lex-secondary">{e.description}</div>}
        </li>
      ))}
    </ol>
  );
}