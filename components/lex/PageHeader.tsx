import type { ReactNode } from "react";

/** Encabezado de página: eyebrow opcional, título, subtítulo y acciones a la derecha. */
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: ReactNode;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col justify-between gap-3 pb-5 pt-3 md:flex-row md:items-end">
      <div className="flex max-w-3xl flex-col">
        {eyebrow && <div className="mb-1 flex items-center gap-2">{eyebrow}</div>}
        <h1 className="text-lex-display tracking-tight text-lex-on-surface">{title}</h1>
        {subtitle && <p className="mt-1 text-lex-body text-lex-secondary">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2 self-start md:self-end">{actions}</div>}
    </div>
  );
}