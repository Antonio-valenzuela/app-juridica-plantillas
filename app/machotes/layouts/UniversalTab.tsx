'use client';
import React from 'react';

/**
 * layouts/UniversalTab — G4
 * Extraído progresivamente de page.tsx (no cambia comportamiento).
 * page.tsx sigue siendo compositor; este layout solo agrupa el tab Motor Universal.
 * Actualmente es placeholder para futura extracción completa.
 */
export function UniversalTab({ children }: { children: React.ReactNode }) {
  return <div className="universal-tab">{children}</div>;
}
