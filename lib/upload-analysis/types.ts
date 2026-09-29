export type UploadAnalysisStatus = 'processing' | 'completed' | 'failed' | 'cancelled';
export type UploadAnalysisPhase = 'RECIBIDO' | 'EXTRAYENDO_TEXTO' | 'OCR' | 'ANALIZANDO' | 'VALIDANDO' | 'LISTO' | 'REQUIERE_ATENCION' | 'ERROR';

export interface UploadAnalysisJob {
  analysisJobId: string;
  ownerKey: string;
  hash: string;
  configKey: string;
  status: UploadAnalysisStatus;
  phase: UploadAnalysisPhase;
  processedPages: number;
  totalPages: number;
  ocrPages: number;
  percentage: number;
  warningsCount: number;
  cacheHit: boolean;
  result: unknown | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  cancelRequested: boolean;
  metrics: Record<string, unknown> | null;
}
