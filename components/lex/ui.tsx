import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Icon } from "./Icon";

/* ───────── Button ───────── */
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  icon?: string;
};

export function Button({ variant = "secondary", icon, className = "", children, ...rest }: ButtonProps) {
  const base =
    "inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3.5 font-lex-ui text-lex-body-strong " +
    "transition-colors focus:outline-none focus-visible:shadow-lex-focus disabled:cursor-not-allowed disabled:opacity-50";
  const styles = {
    primary: "bg-lex-primary-container text-lex-on-primary hover:bg-lex-primary shadow-sm",
    secondary: "bg-lex-surface-lowest text-lex-on-surface border border-black/[0.06] hover:bg-lex-container",
    ghost: "text-lex-on-variant hover:bg-lex-container hover:text-lex-on-surface",
  }[variant];
  return (
    <button className={`${base} ${styles} ${className}`} {...rest}>
      {icon && <Icon name={icon} size={18} className={variant === "secondary" ? "text-lex-secondary" : ""} />}
      {children}
    </button>
  );
}

/* ───────── Badge (solo para estados: Borrador, Perentorio, Cotejada…) ───────── */
const tones = {
  neutral: "bg-lex-container-high text-lex-secondary",
  primary: "bg-lex-primary-fixed text-lex-primary",
  success: "bg-[#e6f2ec] text-lex-success",
  caution: "bg-[#fff8e6] text-[#7A5B00]",
  error: "bg-lex-error-container text-lex-on-error-container",
} as const;

export function Badge({ tone = "neutral", icon, children }: { tone?: keyof typeof tones; icon?: string; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-lex-ui text-[11px] font-medium ${tones[tone]}`}>
      {icon && <Icon name={icon} size={12} filled />}
      {children}
    </span>
  );
}

/* ───────── Kbd (atajo de teclado) ───────── */
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded bg-lex-container-high px-1.5 py-0.5 font-lex-mono text-[10px] text-lex-secondary">{children}</kbd>
  );
}

/* ───────── Segmented control estilo macOS ───────── */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label?: string; icon?: string; title?: string }[];
  ariaLabel?: string;
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} className="inline-flex items-center rounded-lg bg-lex-container p-0.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            title={o.title ?? o.label}
            onClick={() => onChange(o.value)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1 font-lex-ui text-lex-caption transition-colors ${
              active ? "bg-lex-surface-lowest text-lex-on-surface shadow-sm font-medium" : "text-lex-secondary hover:text-lex-on-surface"
            }`}
          >
            {o.icon && <Icon name={o.icon} size={16} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}