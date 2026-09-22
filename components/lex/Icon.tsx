import type { CSSProperties } from "react";

/** Icono Material Symbols (el set que usa Stitch). Ej: <Icon name="folder" size={18} filled /> */
export function Icon({
  name,
  size = 18,
  filled = false,
  className = "",
  style,
}: {
  name: string;
  size?: number;
  filled?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      aria-hidden="true"
      className={`material-symbols-outlined select-none ${filled ? "lex-filled" : ""} ${className}`}
      style={{ fontSize: size, ...style }}
    >
      {name}
    </span>
  );
}