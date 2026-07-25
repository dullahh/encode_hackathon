import type { CareEvent, Handover, SourcedStatement } from '@/types/care';

import type { HandoverValidationIssue, HandoverValidationResult } from './types';

/*
 * P0 is a handover transcription aid, not a clinical decision tool. These words
 * are intentionally conservative: if they occur in a source, its content is
 * retained only as an unresolved review item rather than rephrased as a claim.
 */
const EXCLUDED_CLINICAL_LANGUAGE = /\b(?:diagnos(?:e|ed|is|ing)|triag(?:e|ed|ing)|treat(?:ment|ed|ing)?|medicat(?:e|ed|ion|ions)|prescrib(?:e|ed|ing)|recommend(?:ation|ed|ing|s)?|advis(?:e|ed|ing)|should|must|urgent(?:ly)?|emergency)\b/i;

export function containsExcludedClinicalLanguage(text: string): boolean {
  return EXCLUDED_CLINICAL_LANGUAGE.test(text);
}

export function isSourceCited(statement: SourcedStatement, eventIds: ReadonlySet<CareEvent['id']>): boolean {
  return statement.sourceEventIds.length > 0 && statement.sourceEventIds.every((eventId) => eventIds.has(eventId));
}

/** Validate P0's traceability and non-clinical-generation constraints. */
export function validateGeneratedHandover(handover: Handover, events: readonly CareEvent[]): HandoverValidationResult {
  const issues: HandoverValidationIssue[] = [];
  const eventIds = new Set(events.map((event) => event.id));
  const statements: Array<{ path: string; statement: SourcedStatement }> = [
    { path: 'summary', statement: handover.summary },
    ...handover.claims.map((statement, index) => ({ path: `claims[${index}]`, statement })),
    ...handover.unresolved.map((statement, index) => ({ path: `unresolved[${index}]`, statement })),
  ];

  if (eventIds.size === 0) issues.push({ path: 'events', message: 'At least one source event is required.' });
  if (new Set(handover.sourceEventIds).size !== handover.sourceEventIds.length) {
    issues.push({ path: 'sourceEventIds', message: 'Handover source event IDs must be unique.' });
  }
  if (!handover.sourceEventIds.every((eventId) => eventIds.has(eventId))) {
    issues.push({ path: 'sourceEventIds', message: 'Handover includes an unknown source event ID.' });
  }

  for (const { path, statement } of statements) {
    if (!isSourceCited(statement, eventIds)) {
      issues.push({ path, message: 'Every generated statement must cite one or more supplied source event IDs.' });
    }
    if (containsExcludedClinicalLanguage(statement.text)) {
      issues.push({ path, message: 'Generated text contains excluded diagnosis, triage, or treatment language.' });
    }
  }

  return { valid: issues.length === 0, issues };
}

export function assertValidGeneratedHandover(handover: Handover, events: readonly CareEvent[]): void {
  const validation = validateGeneratedHandover(handover, events);
  if (!validation.valid) {
    throw new Error(`Invalid P0 handover: ${validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join(' ')}`);
  }
}
