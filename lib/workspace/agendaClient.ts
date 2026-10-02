'use client';
import { extractAgendaEvents, readAgendaEvents, synchronizeDocumentAgenda, writeAgendaEvents,
  AGENDA_CHANGED_EVENT, type AgendaExtractionOptions } from './agenda';

/** Durable desktop agenda; WEB retains its existing browser contract. */
export async function synchronizeWorkspaceAgenda(text: string, options: AgendaExtractionOptions): Promise<void> {
  const response = await fetch('/api/workspace/agenda', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'SYNC_DOCUMENT', text, ...options }) });
  if ([401, 405].includes(response.status)) {
    writeAgendaEvents(synchronizeDocumentAgenda(readAgendaEvents(), options.documentId, extractAgendaEvents(text, options)));
    return;
  }
  if (!response.ok) throw new Error('No se pudieron guardar los candidatos de agenda. El documento permanece disponible.');
  window.dispatchEvent(new CustomEvent(AGENDA_CHANGED_EVENT));
}
