import type { CareEvent, Handover, HandoverStatus, SourcedStatement } from '@/types/care';

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
  reason?: 'uncertain_or_negative' | 'excluded_language' | 'missing_narrative';
}

export type { SourcedStatement };
