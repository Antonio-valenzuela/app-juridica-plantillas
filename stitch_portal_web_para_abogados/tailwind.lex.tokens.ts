// tailwind.lex.tokens.ts
// Tokens de LexPlantillas (extraídos de lexplantillas_design_system/DESIGN.md y del tailwind-config de Stitch).
// Todo va bajo el prefijo "lex-" para NO pisar los colores existentes de la app (p. ej. `primary`, `background` de shadcn).
// Uso: bg-lex-surface, text-lex-primary, font-lex-doc, text-lex-body ...

export const lexColors = {
  surface: "#fcf8fb",
  "surface-dim": "#dcd9dc",
  "surface-lowest": "#ffffff",
  "surface-low": "#f6f3f5",
  container: "#f0edef",
  "container-high": "#eae7ea",
  "container-highest": "#e4e2e4",
  "on-surface": "#1b1b1d",
  "on-variant": "#584141",
  "inverse-surface": "#303032",
  "inverse-on-surface": "#f3f0f2",
  outline: "#8c7071",
  "outline-variant": "#e0bfbf",
  tint: "#af2c3e",
  primary: "#78001e",
  "on-primary": "#ffffff",
  "primary-container": "#9b1c31",
  "on-primary-container": "#ffadb0",
  "primary-fixed": "#ffdada",
  "primary-fixed-dim": "#ffb3b5",
  secondary: "#5e5e63",
  "secondary-container": "#e0dfe4",
  "on-secondary-container": "#626267",
  tertiary: "#00423b",
  "tertiary-container": "#005b52",
  "on-tertiary-container": "#89d0c5",
  error: "#ba1a1a",
  "error-container": "#ffdad6",
  "on-error-container": "#93000a",
  variant: "#e4e2e4",
  // Semánticos jurídicos (DESIGN.md)
  success: "#24724D",
  caution: "#9E6A03",
  // Dorado FIREL / "Cotejada SCJN" (usado en badges de las pantallas)
  gold: "#D4AF37",
} as const;

export const lexFontSize = {
  "lex-display": ["28px", { lineHeight: "34px", letterSpacing: "-0.018em", fontWeight: "600" }],
  "lex-section": ["18px", { lineHeight: "24px", letterSpacing: "-0.012em", fontWeight: "600" }],
  "lex-heading": ["15px", { lineHeight: "20px", letterSpacing: "-0.008em", fontWeight: "600" }],
  "lex-body": ["14px", { lineHeight: "20px", letterSpacing: "-0.004em", fontWeight: "400" }],
  "lex-body-strong": ["14px", { lineHeight: "20px", letterSpacing: "-0.004em", fontWeight: "500" }],
  "lex-meta": ["13px", { lineHeight: "18px", letterSpacing: "-0.002em", fontWeight: "400" }],
  "lex-meta-medium": ["13px", { lineHeight: "18px", letterSpacing: "-0.002em", fontWeight: "500" }],
  "lex-caption": ["12px", { lineHeight: "16px", letterSpacing: "0em", fontWeight: "400" }],
  "lex-mono": ["12px", { lineHeight: "16px", letterSpacing: "-0.01em", fontWeight: "400" }],
  "lex-doc-body": ["15px", { lineHeight: "26px", letterSpacing: "0.002em", fontWeight: "400" }],
  "lex-doc-heading": ["20px", { lineHeight: "28px", letterSpacing: "-0.005em", fontWeight: "600" }],
} as const;

export const lexFontFamily = {
  "lex-ui": ["var(--font-lex-ui)", "Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
  "lex-doc": ["var(--font-lex-doc)", "Source Serif 4", "Charter", "Georgia", "Times New Roman", "serif"],
  "lex-mono": ["var(--font-lex-mono)", "JetBrains Mono", "ui-monospace", "monospace"],
} as const;

export const lexBoxShadow = {
  "lex-l2": "0 1px 2px rgba(0,0,0,0.03), 0 4px 12px rgba(0,0,0,0.02)",
  "lex-l3": "0 8px 24px rgba(0,0,0,0.07), 0 2px 6px rgba(0,0,0,0.03)",
  "lex-sheet": "0 4px 24px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)",
  "lex-focus": "0 0 0 3px rgba(155,28,49,0.12)",
} as const;