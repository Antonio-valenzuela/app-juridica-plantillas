import 'server-only';
import { DesktopRecordRepository } from './desktopRecordRepository';
import type { AgendaEvent } from './agenda';
export interface DesktopAgendaEvent extends AgendaEvent {
  sourceKey?: string;
  deleted?: boolean;
  userEdited?: boolean;
}
export function desktopAgenda() {
  return new DesktopRecordRepository<DesktopAgendaEvent>('agenda', event => typeof event.title === 'string'
    && typeof event.dueDate === 'string' && ['HIGH', 'MEDIUM', 'LOW'].includes(event.priority)
    && ['PENDING', 'COMPLETED'].includes(event.status) && ['MANUAL', 'DOCUMENT'].includes(event.source));
}
