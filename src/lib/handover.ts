import type { CareEvent, Handover } from '@/types/care';

/** Guards the evidence rule before a handover can be displayed or shared. */
export function hasTraceableEvidence(handover: Handover, events: CareEvent[]): boolean {
  const eventIds = new Set(events.map((event) => event.id));
  const statements = [handover.summary, ...handover.claims, ...handover.unresolved];
  return statements.every((statement) => statement.sourceEventIds.length > 0 && statement.sourceEventIds.every((id) => eventIds.has(id)));
}
