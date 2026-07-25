import type { CareEvent, Handover, SourcedStatement } from '@/types/care';

import { assertValidGeneratedHandover, containsExcludedClinicalLanguage, containsUncertainOrNegativeLanguage } from './safety';
import type { ClassifiedEvent, GenerateHandoverInput } from './types';

function orderEvents(events: readonly CareEvent[]): CareEvent[] {
  return [...events].sort((left, right) => {
    const byTime = left.occurredAt.localeCompare(right.occurredAt);
    return byTime === 0 ? left.id.localeCompare(right.id) : byTime;
  });
}

function formatDate(occurredAt: string): string {
  const parsed = new Date(occurredAt);
  if (Number.isNaN(parsed.getTime())) return 'an unparseable date';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(parsed);
}

function asCanonicalTimestamp(timestamp: string): string {
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid timestamp: ${timestamp}`);
  return parsed.toISOString();
}

/** Separates source-recorded facts from missing, negative, or uncertain information without inference. */
export function classifyCareEvent(event: CareEvent): ClassifiedEvent {
  const narrative = event.narrative.trim();
  if (!narrative) return { event, destination: 'unresolved', reason: 'missing_narrative' };
  if (containsExcludedClinicalLanguage(narrative)) return { event, destination: 'unresolved', reason: 'excluded_language' };
  if (containsUncertainOrNegativeLanguage(narrative)) return { event, destination: 'unresolved', reason: 'uncertain_or_negative' };
  return { event, destination: 'claim' };
}

function unresolvedText(classification: ClassifiedEvent): string {
  const date = formatDate(classification.event.occurredAt);
  switch (classification.reason) {
    case 'missing_narrative':
      return `The ${classification.event.category.replace('_', ' ')} item dated ${date} has no recorded narrative.`;
    case 'excluded_language':
      return `The ${classification.event.category.replace('_', ' ')} item dated ${date} needs source-record review before it can appear in this P0 handover.`;
    default:
      return `Unresolved source note dated ${date}: ${classification.event.narrative.trim()}`;
  }
}

function claimText(event: CareEvent): string {
  return `Source-recorded ${event.category.replace('_', ' ')} item dated ${formatDate(event.occurredAt)}: ${event.narrative.trim()}`;
}

function statement(id: string, text: string, eventId: CareEvent['id']): SourcedStatement {
  return { id, text, sourceEventIds: [eventId] };
}

function buildSummary(claims: readonly SourcedStatement[], unresolved: readonly SourcedStatement[]): SourcedStatement {
  const sourceEventIds = [...claims, ...unresolved].flatMap((item) => item.sourceEventIds);
  if (claims.length > 0) {
    return {
      id: 'summary-generated',
      text: `This handover contains ${claims.length} source-recorded item${claims.length === 1 ? '' : 's'} and ${unresolved.length} item${unresolved.length === 1 ? '' : 's'} under unresolved.`,
      sourceEventIds,
    };
  }

  return {
    id: 'summary-generated',
    text: `This handover contains ${unresolved.length} item${unresolved.length === 1 ? '' : 's'} under unresolved and no generated factual claims.`,
    sourceEventIds,
  };
}

/**
 * Pure, offline P0 generation. It neither calls a model nor reads credentials,
 * so it is safe to invoke only from server-owned code without exposing secrets.
 */
export function generateDeterministicHandover(input: GenerateHandoverInput): Handover {
  const events = orderEvents(input.events);
  if (events.length === 0) throw new Error('Cannot generate a handover without source events.');
  if (events.some((event) => event.patientId !== input.patientId)) {
    throw new Error('Every source event must belong to the requested patient.');
  }
  if (new Set(events.map((event) => event.id)).size !== events.length) {
    throw new Error('Source event IDs must be unique.');
  }

  const claims: SourcedStatement[] = [];
  const unresolved: SourcedStatement[] = [];
  for (const event of events) {
    const classification = classifyCareEvent(event);
    if (classification.destination === 'claim') {
      claims.push(statement(`claim-${event.id}`, claimText(event), event.id));
    } else {
      unresolved.push(statement(`unresolved-${event.id}`, unresolvedText(classification), event.id));
    }
  }

  const handover: Handover = {
    id: input.id,
    patientId: input.patientId,
    generatedAt: input.generatedAt ? asCanonicalTimestamp(input.generatedAt) : asCanonicalTimestamp(events[events.length - 1].occurredAt),
    status: input.status ?? 'draft',
    summary: buildSummary(claims, unresolved),
    claims,
    unresolved,
    sourceEventIds: events.map((event) => event.id),
  };

  assertValidGeneratedHandover(handover, events);
  return handover;
}
