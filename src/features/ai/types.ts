import type { CareEvent, Handover, HandoverSection, HandoverStatus, SourcedStatement } from '@/types/care';

/** Input for the deterministic P0 handover generator. It deliberately has no model or API settings. */
export interface GenerateHandoverInput {
  id: Handover['id'];
  patientId: Handover['patientId'];
  events: readonly CareEvent[];
  /** Defaults to the latest supplied event time so repeat runs are stable. */
  generatedAt?: Handover['generatedAt'];
  status?: HandoverStatus;
}

export interface HandoverValidationIssue {
  path: string;
  message: string;
}

export interface HandoverValidationResult {
  valid: boolean;
  issues: HandoverValidationIssue[];
}

export interface ClassifiedEvent {
  event: CareEvent;
  destination: 'claim' | 'unresolved';
  reason?: 'uncertain_or_negative' | 'excluded_language' | 'missing_narrative' | 'needs_clarification';
}

/** Strict provider payload: it selects evidence and a neutral display section only. */
export interface StructuredClaimSelection {
  section: HandoverSection;
  sourceEventIds: CareEvent['id'][];
}

export interface StructuredUnresolvedSelection {
  reason: 'uncertain_or_incomplete' | 'conflicting_information' | 'restricted_source_language';
  sourceEventIds: CareEvent['id'][];
}

export interface StructuredHandoverOutput {
  claims: StructuredClaimSelection[];
  unresolved: StructuredUnresolvedSelection[];
}

export type { SourcedStatement };
