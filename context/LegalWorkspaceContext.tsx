"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from "react";
import { usePathname } from "next/navigation";

export type ContextMode = "current_document" | "current_case" | "current_bulletin" | "none";

export interface LegalWorkspacePageContext {
  route: string;
  module: string;
  pageTitle?: string;
  pageLabel: string;
}

export interface LegalWorkspaceDocumentContext {
  draftId?: string;
  documentId?: string;
  templateId?: string;
  documentType?: string;
  templateName?: string;
  matter?: string;
  jurisdiction?: string;
  procedureType?: string;
  fields?: Record<string, any>;
  sections?: Record<string, string>;
  previewText?: string;
  pendingMarkers?: string[];
  updatedAt?: string;
}

/** Resultado real de aplicar operaciones de edición sobre el borrador actual. */
export interface DocumentEditResult {
  appliedCount: number;
  failedCount: number;
  failures: string[];
  saved: boolean;
  documentId?: string;
}

export type DocumentMutator = (
  operations: Array<{
    documentId?: string;
    sectionId?: string;
    operation: 'replace_text' | 'replace_field' | 'replace_section' | 'insert_after' | 'insert_before';
    target: string;
    replacement: string;
    reason?: string;
  }>,
  opts: { persist?: boolean }
) => Promise<DocumentEditResult>;

export interface LegalWorkspaceCaseContext {
  caseId?: string;
  expedienteNumber?: string;
  court?: string;
  actor?: string;
  demandado?: string;
  matter?: string;
}

export interface LegalWorkspaceBulletinContext {
  subscriptionId?: string;
  expediente?: string;
  sourceId?: string;
  sourceName?: string;
}

interface LegalWorkspaceContextType {
  route: string;
  module: string;
  pageContext: LegalWorkspacePageContext;
  contextMode: ContextMode;
  activeDocument: LegalWorkspaceDocumentContext | null;
  activeCase: LegalWorkspaceCaseContext | null;
  activeBulletin: LegalWorkspaceBulletinContext | null;
  setContextMode: (mode: ContextMode) => void;
  setActiveDocument: (doc: LegalWorkspaceDocumentContext | null) => void;
  /** Actualiza el snapshot del borrador SIN forzar el modo de contexto elegido por el usuario. */
  syncActiveDocument: (doc: LegalWorkspaceDocumentContext | null) => void;
  updateDocumentFields: (fields: Record<string, any>, previewText?: string, pendingMarkers?: string[]) => void;
  clearActiveDocument: () => void;
  setActiveCase: (caseCtx: LegalWorkspaceCaseContext | null) => void;
  clearActiveCase: () => void;
  setActiveBulletin: (bulletinCtx: LegalWorkspaceBulletinContext | null) => void;
  clearActiveBulletin: () => void;
  setPageTitle: (title: string) => void;
  /** Registra el ejecutor real de ediciones (implementado por la página del editor). */
  registerDocumentMutator: (mutator: DocumentMutator | null) => () => void;
  /** Ejecuta operaciones de edición sobre el borrador REAL del editor. */
  requestDocumentEdits: (
    operations: Parameters<DocumentMutator>[0],
    opts?: { persist?: boolean }
  ) => Promise<DocumentEditResult>;
}

const LegalWorkspaceContext = createContext<LegalWorkspaceContextType | undefined>(undefined);

function detectModuleFromPath(pathname: string): string {
  if (pathname.includes("/machotes")) return "machotes";
  if (pathname.includes("/expedientes")) return "expedientes";
  if (pathname.includes("/boletines")) return "boletines";
  if (pathname.includes("/cambios")) return "cambios";
  if (pathname.includes("/jurisprudencia")) return "jurisprudencia";
  if (pathname.includes("/leyes")) return "leyes";
  if (pathname.includes("/documents") || pathname.includes("/items")) return "documentos";
  return "general";
}

function detectPageLabel(pathname: string): string {
  if (pathname === "/" || pathname === "" || pathname === "/index") return "Dashboard";
  if (pathname.includes("/legal-hub/machotes")) return "Generador de Machotes";
  if (pathname.includes("/legal-hub/boletines")) return "Boletines Judiciales";
  if (pathname.includes("/legal-hub/expedientes")) return "Gestión de Expedientes";
  if (pathname.includes("/search")) return "Búsqueda Legal";
  if (pathname.includes("/jurisprudencia")) return "Jurisprudencia";
  if (pathname.includes("/leyes")) return "Leyes";
  if (pathname.includes("/documents") || pathname.includes("/items")) return "Documentos";
  return "Pantalla legal";
}

export function LegalWorkspaceProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "";
  const currentModule = detectModuleFromPath(pathname);

  const [pageTitle, setPageTitleState] = useState('');
  const pageContext = useMemo<LegalWorkspacePageContext>(() => ({
    route: pathname,
    module: currentModule,
    pageTitle: typeof document !== 'undefined' ? document.title : pageTitle,
    pageLabel: detectPageLabel(pathname),
  }), [pathname, currentModule, pageTitle]);

  const [activeDocument, setActiveDocumentState] = useState<LegalWorkspaceDocumentContext | null>(() => {
    try {
      const saved = sessionStorage.getItem("juridico_active_draft");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [activeCase, setActiveCaseState] = useState<LegalWorkspaceCaseContext | null>(null);
  const [activeBulletin, setActiveBulletinState] = useState<LegalWorkspaceBulletinContext | null>(null);

  const [contextMode, setContextModeState] = useState<ContextMode>('none');

  const setContextMode = useCallback((mode: ContextMode) => {
    setContextModeState(mode);
  }, []);

  const setActiveDocument = useCallback((doc: LegalWorkspaceDocumentContext | null) => {
    setActiveDocumentState((prev) => {
      if (
        prev === doc ||
        (prev &&
          doc &&
          prev.templateId === doc.templateId &&
          prev.previewText === doc.previewText &&
          JSON.stringify(prev.fields) === JSON.stringify(doc.fields))
      ) {
        return prev;
      }
      return doc;
    });

    if (doc) {
      setContextModeState('current_document');
      try {
        sessionStorage.setItem("juridico_active_draft", JSON.stringify(doc));
      } catch {}
    } else {
      try {
        sessionStorage.removeItem("juridico_active_draft");
      } catch {}
    }
  }, []);

  // Igual que setActiveDocument pero respeta el modo elegido por el usuario en la burbuja:
  // sincroniza el snapshot del borrador sin secuestrar contextMode.
  const syncActiveDocument = useCallback((doc: LegalWorkspaceDocumentContext | null) => {
    setActiveDocumentState((prev) => {
      if (
        prev === doc ||
        (prev &&
          doc &&
          prev.templateId === doc.templateId &&
          prev.previewText === doc.previewText &&
          JSON.stringify(prev.fields) === JSON.stringify(doc.fields))
      ) {
        return prev;
      }
      return doc;
    });
    if (doc) {
      try {
        sessionStorage.setItem("juridico_active_draft", JSON.stringify(doc));
      } catch {}
    } else {
      try {
        sessionStorage.removeItem("juridico_active_draft");
      } catch {}
    }
  }, []);

  const updateDocumentFields = useCallback((
    fields: Record<string, any>,
    previewText?: string,
    pendingMarkers?: string[]
  ) => {
    setActiveDocumentState((prev) => {
      if (!prev) return prev;
      const updated = {
        ...prev,
        fields: { ...(prev.fields || {}), ...fields },
        previewText: previewText !== undefined ? previewText : prev.previewText,
        pendingMarkers: pendingMarkers !== undefined ? pendingMarkers : prev.pendingMarkers,
        updatedAt: new Date().toISOString(),
      };
      try {
        sessionStorage.setItem("juridico_active_draft", JSON.stringify(updated));
      } catch {}
      return updated;
    });
  }, []);

  const clearActiveDocument = useCallback(() => {
    setActiveDocumentState(null);
    setContextModeState('none');
    try {
      sessionStorage.removeItem("juridico_active_draft");
    } catch {}
  }, []);

  const setActiveCase = useCallback((caseCtx: LegalWorkspaceCaseContext | null) => {
    setActiveCaseState(caseCtx);
    if (caseCtx) setContextModeState('current_case');
  }, []);

  const clearActiveCase = useCallback(() => {
    setActiveCaseState(null);
    setContextModeState('none');
  }, []);

  const setActiveBulletin = useCallback((bulletinCtx: LegalWorkspaceBulletinContext | null) => {
    setActiveBulletinState(bulletinCtx);
    if (bulletinCtx) setContextModeState('current_bulletin');
  }, []);

  const clearActiveBulletin = useCallback(() => {
    setActiveBulletinState(null);
    setContextModeState('none');
  }, []);

  const setPageTitle = useCallback((title: string) => {
    setPageTitleState(title);
  }, []);

  // Ejecutor real de ediciones sobre el borrador del editor (registrado por la página activa).
  const documentMutatorRef = useRef<DocumentMutator | null>(null);

  const registerDocumentMutator = useCallback((mutator: DocumentMutator | null) => {
    documentMutatorRef.current = mutator;
    return () => {
      if (documentMutatorRef.current === mutator) {
        documentMutatorRef.current = null;
      }
    };
  }, []);

  const requestDocumentEdits = useCallback(
    async (
      operations: Parameters<DocumentMutator>[0],
      opts?: { persist?: boolean }
    ): Promise<DocumentEditResult> => {
      const mutator = documentMutatorRef.current;
      if (!mutator) {
        return {
          appliedCount: 0,
          failedCount: operations?.length || 0,
          failures: ['NO_MUTATOR: no hay un documento editable registrado en esta pantalla.'],
          saved: false,
        };
      }
      try {
        return await mutator(operations || [], { persist: opts?.persist ?? true });
      } catch (err: any) {
        return {
          appliedCount: 0,
          failedCount: operations?.length || 0,
          failures: [`MUTATOR_ERROR: ${err?.message || 'fallo desconocido'}`],
          saved: false,
        };
      }
    },
    []
  );

  const contextValue = useMemo(
    () => ({
      route: pathname,
      module: currentModule,
      pageContext,
      contextMode,
      activeDocument,
      activeCase,
      activeBulletin,
      setContextMode,
      setActiveDocument,
      syncActiveDocument,
      updateDocumentFields,
      clearActiveDocument,
      setActiveCase,
      clearActiveCase,
      setActiveBulletin,
      clearActiveBulletin,
      setPageTitle,
      registerDocumentMutator,
      requestDocumentEdits,
    }),
    [
      pathname,
      currentModule,
      pageContext,
      contextMode,
      activeDocument,
      activeCase,
      activeBulletin,
      setContextMode,
      setActiveDocument,
      syncActiveDocument,
      updateDocumentFields,
      clearActiveDocument,
      setActiveCase,
      clearActiveCase,
      setActiveBulletin,
      clearActiveBulletin,
      setPageTitle,
      registerDocumentMutator,
      requestDocumentEdits,
    ]
  );

  return (
    <LegalWorkspaceContext.Provider value={contextValue}>
      {children}
    </LegalWorkspaceContext.Provider>
  );
}

export function useLegalWorkspaceContext() {
  const context = useContext(LegalWorkspaceContext);
  if (!context) {
    return {
      route: "",
      module: "general",
      pageContext: { route: "", module: "general", pageTitle: "", pageLabel: "general" },
      contextMode: "none" as ContextMode,
      activeDocument: null,
      activeCase: null,
      activeBulletin: null,
      setContextMode: () => {},
      setActiveDocument: () => {},
      syncActiveDocument: () => {},
      updateDocumentFields: () => {},
      clearActiveDocument: () => {},
      setActiveCase: () => {},
      clearActiveCase: () => {},
      setActiveBulletin: () => {},
      clearActiveBulletin: () => {},
      setPageTitle: () => {},
      registerDocumentMutator: () => () => {},
      requestDocumentEdits: async (operations: Parameters<DocumentMutator>[0]) => ({
        appliedCount: 0,
        failedCount: operations?.length || 0,
        failures: ['NO_MUTATOR: no hay un documento editable registrado en esta pantalla.'],
        saved: false,
      }),
    };
  }
  return context;
}
