import { describe, expect, it } from 'vitest';
import {
  extractAgendaEvents,
  synchronizeDocumentAgenda,
  type AgendaEvent,
} from '@/lib/workspace/agenda';

describe('workspace agenda', () => {
  it('registra automáticamente un término referido al lunes siguiente', () => {
    const events = extractAgendaEvents(
      'Se concede un término procesal para el lunes a efecto de presentar el escrito.',
      {
        documentId: 'doc-1',
        caseId: 'case-1',
        expediente: '123/2026',
        referenceDate: '2026-09-24',
      },
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      documentId: 'doc-1',
      caseId: 'case-1',
      dueDate: '2026-09-28',
      priority: 'HIGH',
      needsReview: true,
    });
    expect(events[0].sourceText).toMatch(/término procesal/i);
  });

  it('conserva una fecha explícita y clasifica una audiencia como prioridad media', () => {
    const events = extractAgendaEvents(
      'La audiencia constitucional se celebrará el 30 de septiembre de 2026.',
      { documentId: 'doc-2', referenceDate: '2026-09-24' },
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      dueDate: '2026-09-30',
      priority: 'MEDIUM',
      needsReview: false,
    });
  });

  it('mantiene identificadores distintos para dos actos del mismo día', () => {
    const events = extractAgendaEvents(
      'El término vence el 30 de septiembre de 2026. La audiencia se celebrará el 30 de septiembre de 2026.',
      { documentId: 'doc-3', referenceDate: '2026-09-24' },
    );

    expect(events).toHaveLength(2);
    expect(new Set(events.map((event) => event.id)).size).toBe(2);
  });

  it('sincroniza eventos del documento sin duplicarlos y conserva el estado atendido', () => {
    const previous: AgendaEvent[] = [
      {
        id: 'agenda-doc-1-2026-09-28',
        documentId: 'doc-1',
        dueDate: '2026-09-28',
        title: 'Término procesal',
        priority: 'HIGH',
        status: 'COMPLETED',
        needsReview: true,
        source: 'DOCUMENT',
        sourceText: 'Se concede un término procesal para el lunes.',
        createdAt: '2026-09-24T12:00:00.000Z',
        updatedAt: '2026-09-24T12:00:00.000Z',
      },
      {
        id: 'agenda-doc-1-stale',
        documentId: 'doc-1',
        dueDate: '2026-09-29',
        title: 'Evento anterior',
        priority: 'LOW',
        status: 'PENDING',
        needsReview: false,
        source: 'DOCUMENT',
        sourceText: 'Evento que ya no aparece.',
        createdAt: '2026-09-24T12:00:00.000Z',
        updatedAt: '2026-09-24T12:00:00.000Z',
      },
    ];
    const next = extractAgendaEvents(
      'Se concede un término procesal para el lunes.',
      { documentId: 'doc-1', referenceDate: '2026-09-24' },
    );

    const synchronized = synchronizeDocumentAgenda(previous, 'doc-1', next);

    expect(synchronized).toHaveLength(1);
    expect(synchronized[0]).toMatchObject({
      id: 'agenda-doc-1-2026-09-28',
      status: 'COMPLETED',
    });
  });
});
