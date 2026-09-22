import type { ReactNode } from "react";
import { Icon } from "./Icon";

const toneText = { neutral: "text-lex-on-surface", error: "text-lex-primary", success: "text-lex-success" } as const;

export function StatCard({
  label, value, caption, tone = "neutral", icon, accent = false, children,
}: {
  label: string; value: ReactNode; caption?: ReactNode; tone?: keyof typeof toneText;
  icon?: string; accent?: boolean; children?: ReactNode;
}) {
  return (
    <div className={`relative flex flex-col gap-1 rounded-xl bg-lex-surface-lowest p-4 shadow-lex-l2 ${accent ? "border-l-[3px] border-lex-primary-container" : ""}`}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-lex-secondary">{label}</span>
        {icon && <Icon name={icon} size={18} className="text-lex-secondary" />}
      </div>
      <div className={`lex-tabular text-[28px] font-semibold leading-9 tracking-tight ${toneText[tone]}`}>{value}</div>
      {caption && <div className="text-lex-meta text-lex-secondary">{caption}</div>}
      {children}
    </div>
  );
}