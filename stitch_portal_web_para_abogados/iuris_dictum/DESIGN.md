---
name: Iuris Dictum
colors:
  surface: '#fcf8fb'
  surface-dim: '#dcd9dc'
  surface-bright: '#fcf8fb'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f6f3f5'
  surface-container: '#f0edef'
  surface-container-high: '#eae7ea'
  surface-container-highest: '#e4e2e4'
  on-surface: '#1b1b1d'
  on-surface-variant: '#584142'
  inverse-surface: '#303032'
  inverse-on-surface: '#f3f0f2'
  outline: '#8b7171'
  outline-variant: '#dfbfbf'
  surface-tint: '#ad2f40'
  primary: '#4f0011'
  on-primary: '#ffffff'
  primary-container: '#78001e'
  on-primary-container: '#ff7883'
  inverse-primary: '#ffb3b5'
  secondary: '#af2c3e'
  on-secondary: '#ffffff'
  secondary-container: '#fd6673'
  on-secondary-container: '#680018'
  tertiary: '#735c00'
  on-tertiary: '#ffffff'
  tertiary-container: '#cca72f'
  on-tertiary-container: '#4e3d00'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdada'
  primary-fixed-dim: '#ffb3b5'
  on-primary-fixed: '#40000c'
  on-primary-fixed-variant: '#8c142a'
  secondary-fixed: '#ffdada'
  secondary-fixed-dim: '#ffb3b5'
  on-secondary-fixed: '#40000b'
  on-secondary-fixed-variant: '#8e1029'
  tertiary-fixed: '#ffe088'
  tertiary-fixed-dim: '#e9c349'
  on-tertiary-fixed: '#241a00'
  on-tertiary-fixed-variant: '#574500'
  background: '#fcf8fb'
  on-background: '#1b1b1d'
  surface-variant: '#e4e2e4'
typography:
  display-lg:
    fontFamily: Source Serif 4
    fontSize: 40px
    fontWeight: '600'
    lineHeight: 48px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Source Serif 4
    fontSize: 30px
    fontWeight: '600'
    lineHeight: 38px
    letterSpacing: -0.015em
  headline-lg:
    fontFamily: Source Serif 4
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Source Serif 4
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 30px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Source Serif 4
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  headline-sm:
    fontFamily: Source Serif 4
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Source Serif 4
    fontSize: 17px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  label-lg:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.02em
  code-md:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: -0.01em
  code-sm:
    fontFamily: JetBrains Mono
    fontSize: 10px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0.02em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-compact: 0.5rem
  margin: 1.5rem
  margin-mobile: 0.75rem
  space-xxs: 0.125rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1.25rem
  space-xl: 2rem
---

## Brand & Style

This design system serves the litigating judiciary and elite legal practitioners across Mexico and Latin America. Built for heavy, high-velocity drafting, court filing surveillance, and jurisprudence consultation, the interface projects absolute rigor, judicial solemnity, and cutting-edge operational efficiency. 

The aesthetic philosophy balances **Editorial Authority** with **High-Density Technical Utility**. It rejects frivolous whitespace, juvenile rounded forms, and distracting decorative effects in favor of crisp architectural framing, refined typography, and purposeful data density. Drawing from classical legal codices, Mexican Supreme Court (SCJN) notifications, and modernized judicial records, the UI establishes an aura of prestige and trust: deep imperial burgundy evokes sovereign legal authority, while warm stone and crisp white substrates provide an fatigue-free canvas for hours of drafting, analysis, and filing review.

## Colors

The palette is engineered specifically for dense procedural workflows, electronic court signatures (FIREL/e.firma), and fast judicial scanning:

- **Primary (`#78001e`)**: Deep imperial burgundy. Anchors key legal actions, primary navigations, and definitive procedural endorsements.
- **Secondary / Primary Container (`#9b1c31`)**: Claret. Utilized for active states, secondary calls-to-action, active sidebar elements, and critical highlights.
- **Tertiary / SCJN Gold (`#D4AF37`)**: Reserved strictly for high-prestige and institutional verification points: SCJN jurisprudence badges, FIREL digital signature stamps, certification marks, and sealed documents.
- **Juridical Semantics**:
  - **Success Emerald (`#24724D`)**: Admitted motions, sealed filings, positive term tracking.
  - **Caution Amber (`#9E6A03`)**: Pending terms (*términos fatales* approaching), conditional notifications, review notices.
  - **Error Crimson (`#ba1a1a`)**: Dismissed motions (*desechadas*), expired statutory deadlines, validation failures.
- **Surfaces & Neutral Hierarchy**:
  - `Surface Lowest`: `#ffffff` — Core drafting sheets, expediente document viewers, pure inputs.
  - `Surface`: `#fcf8fb` — Primary interface canvas.
  - `Surface Low`: `#f6f3f5` — Subordinate toolbars, sidebars, navigation trays.
  - `Container High`: `#eae7ea` — Table headers, panel sectioning, active row backgrounds.
  - `Container Highest`: `#e4e2e4` — Inactive borders, drag rails, structural splitters.
  - `On Surface`: `#1b1b1d` — High-legibility obsidian text, optimized for contrast under ambient court and office lighting.
  - `Outline`: `#8c7071` — Controlled borders for inputs, active structural boundaries, focus rings.
  - `Outline Variant`: `#e0bfbf` — Subdued dividers, table grid lines, subtle component boundaries.

## Typography

The typographic hierarchy enforces a dual-register model:

1. **Judicial Editorial (Source Serif 4)**: Applied to section headings, document canvas viewports, legal templates (*rubros*, *resultandos*, *considerandos*), and petition titles. Its classical serif structure gives litigators the visual grounding of actual judicial opinions and printed court decrees.
2. **System Interface (Inter)**: Handles dense application scaffolding, tables, filters, navigation bars, and form controls. Inter provides neutral clarity across high-information displays without fatiguing the eye.
3. **Registry & Forensics (JetBrains Mono)**: Reserved for expediente identifiers (e.g., `EXP. 1248/2024-III`), judicial circuit notations, FIREL cryptographic hashes, timestamp tokens, and raw metadata. Its tabular digits align financial quantities and court deadlines cleanly.

## Layout & Spacing

This design system implements a dense multi-pane workspace layout designed for 1200px+ desktop environments, adapting smoothly to tablet and mobile screens during emergency courtroom filings:

- **Desktop (>= 1280px)**: Three-pane layout consisting of a 240px collapsable navigation panel, a 360px master expediente list or template outline, and a flexible detail/document canvas filling the remaining space. Gutters are locked to `1rem` (16px) for high efficiency.
- **Tablet (768px - 1279px)**: Two-pane model. The primary navigation collapses to an icon sidebar rail (56px); document lists and editor panes split fluidly (40% / 60%).
- **Mobile (< 768px)**: Stacked single-view model. The drafting editor transitions to an expanded vertical reading flow with floating action bars. Section margins reduce to `0.75rem`.

A strict 4px base increment rules spacing. Data-intensive tables use dense row heights (32px - 36px), whereas document drafting views enforce comfortable optical margins (48px - 64px horizontal margins inside the simulated sheet).

## Elevation & Depth

Visual depth is communicated primarily through **Tonal Surface Layering** and **Low-Contrast Structural Outlines**, rather than dramatic physical shadows:

- **Layer 0 (Base Canvas)**: Background tint `#fcf8fb`.
- **Layer 1 (Panels & Toolbars)**: `#f6f3f5` delimited by a 1px border of `#e0bfbf`.
- **Layer 2 (Work Sheets & Active Cards)**: Pure `#ffffff` surface, bounded by `#e0bfbf` with an ultra-subtle, warm ambient shadow (`0 1px 3px rgba(120, 0, 30, 0.04)`).
- **Layer 3 (Modals, Command Palettes, Dropdown Menus)**: `#ffffff` elevated by `0 8px 24px -4px rgba(27, 27, 29, 0.12), 0 2px 6px -1px rgba(120, 0, 30, 0.06)`, framed by `#8c7071`.

This restrained depth keeps legal text crisp and legible, avoiding blur artifacts during continuous multi-window review.

## Shapes

The design system maintains a **Soft Architectural (`1`)** shape language:

- Standard controls, inputs, badges, and buttons utilize a strict `0.25rem` (4px) radius.
- Cards, modal containers, and drawer panels scale to `0.5rem` (8px).
- Digital signature tokens and verification seals adopt a pill form (`9999px`) to immediately distinguish authoritative system stamps from interactive square UI components.

The geometry emphasizes straight lines, precision joints, and formal proportion, aligning with physical legal seals, docket folders, and judicial folios.

## Components

### Buttons
- **Primary**: Solid imperial burgundy background (`#78001e`), white label (`#ffffff`), 4px border radius, 36px height (standard) or 28px height (compact toolbars). Subtle hover transition to `#9b1c31`.
- **Secondary**: `#ffffff` background with 1px border in `#8c7071` and text in `#78001e`. Hover to `#f6f3f5`.
- **Destructive**: Background transparent, text `#ba1a1a`, border `#ba1a1a`. Active/Hover introduces `#ba1a1a` solid fill with `#ffffff` text.
- **Judicial / Seal Action**: SCJN gold tint outline (`#D4AF37`) with text `#1b1b1d` and gold icon badge for FIREL submission and cotejo verification.

### Inputs & Form Fields
- Height of 36px, background `#ffffff`, 1px border `#e0bfbf`.
- Text styled in `body-md` Inter with placeholder in `#8c7071`.
- Focused state renders a crisp 1.5px border in `#78001e` with zero offset glow.
- Includes integrated monospaced prefixes for court filings (e.g., `Juzgado:`, `Toca:`).

### Expediente & Status Chips
- Height of 22px, font styled with `code-sm`.
- **Admitted / En Término**: Emerald background `rgba(36, 114, 77, 0.08)`, border and text `#24724D`.
- **Urgente / Fatal Term**: Amber background `rgba(158, 106, 3, 0.08)`, border and text `#9E6A03`.
- **Desechado / Precluido**: Crimson background `rgba(186, 26, 26, 0.08)`, border and text `#ba1a1a`.
- **Cotejado / FIREL**: Soft gold background `rgba(212, 175, 55, 0.15)`, border `#D4AF37`, text `#1b1b1d`.

### Cards & Docket Panels
- Background `#ffffff` on `#f6f3f5` panels, framed with 1px `#e0bfbf`.
- Header bar features a subtle border divider and serif titling (`headline-sm`).
- Metadata strips use `label-sm` combined with `code-md` for quick parsing of notification dates.

### Data Tables (Listas de Acuerdos / Expedientes)
- Alternate row background on hover with `#f6f3f5`.
- Header row fixed at 32px height, colored `#eae7ea`, text in `label-sm` uppercase.
- Cells enforce tabular alignment: numeric term deadlines and expediente numbers align right in `JetBrains Mono`.

### Legal Drafting Canvas (Document Editor)
- Simulates physical court paper (`#ffffff`) centered on canvas (`#f6f3f5`).
- Editorial text rendered in `Source Serif 4`, 17px with 1.75 line-height for authentic reading cadence.
- Margin markers indicate court submission print boundaries and judicial seal anchors.