'use client';
import { useState, useCallback, useRef, useEffect } from 'react';

/**
 * useGenerationJob — hook extraído progresivamente de page.tsx (P10)
 * Encapsula polling, cancelación y persistencia localStorage.
 * No cambia comportamiento, solo mueve lógica.
 */
export interface GenerationJobState {
  jobId: string;
  total: number;
  completed: number;
  percentage: number;
  currentBlock: string | null;
  status: string;
  stage?: string;
  aiProvider?: string | null;
  error?: string | null;
}

export function useGenerationJob() {
  const [activeJob, setActiveJob] = useState<GenerationJobState | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const genPollRef = useRef<number | null>(null);
  const genJobIdRef = useRef<string | null>(null);

  const stopPolling = useCallback(() => {
    if (genPollRef.current) window.clearInterval(genPollRef.current);
    genPollRef.current = null;
  }, []);

  const cancel = useCallback(async () => {
    const jobId = genJobIdRef.current || activeJob?.jobId;
    if (!jobId) return;
    setIsCancelling(true);
    try {
      await fetch('/api/legal-engine/generate/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId }),
      });
    } finally {
      setTimeout(() => setIsCancelling(false), 2000);
    }
  }, [activeJob]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  return { activeJob, isGenerating, isCancelling, setActiveJob, setIsGenerating, stopPolling, cancel, genJobIdRef, genPollRef };
}
