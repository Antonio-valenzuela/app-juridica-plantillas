import type { ReactNode } from "react";
import { Icon } from "./Icon";
import { Kbd } from "./ui";

export function FilterBar({
  query, onQueryChange, placeholder = "Buscar…", shortcut = "⌘F",
  chips, activeChip, onChipChange, right,
}: {
  query: string; onQueryChange: (q: string) => void; placeholder?: string; shortcut?: string;
  chips?: { id: string; label: string; count?: number }[]; activeChip?: string; onChipChange?: (id: string) => void;
  right?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-col gap-2 rounded-xl bg-lex-surface-lowest p-2 shadow-lex-l2">
      <div className="flex flex-col justify-between gap-2 lg:flex-row lg:items-center">
        <label className="flex h-9 w-full max-w-xl items-center rounded-lg bg-lex-surface-low px-3 text-lex-on-variant focus-within:bg-lex-surface-lowest focus-within:shadow-lex-focus">
          <Icon name="search" size={18} className="mr-2 text-lex-secondary" />
          <input value={query} onChange={(e) => onQueryChange(e.target.value)} placeholder={placeholder}
            className="w-full border-none bg-transparent text-lex-body text-lex-on-surface outline-none placeholder:text-lex-secondary" />
          <Kbd>{shortcut}</Kbd>
        </label>
        {right && <div className="flex items-center gap-2">{right}</div>}
      </div>
      {chips && chips.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pt-1 lex-scroll">
          {chips.map((c) => {
            const on = c.id === activeChip;
            return (
              <button key={c.id} onClick={() => onChipChange?.(c.id)}
                className={`shrink-0 rounded-full px-3 py-1 text-lex-caption transition-colors ${on ? "bg-lex-on-surface font-medium text-white" : "bg-lex-container text-lex-secondary hover:text-lex-on-surface"}`}>
                {c.label}{typeof c.count === "number" && <span className="lex-tabular"> ({c.count})</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}