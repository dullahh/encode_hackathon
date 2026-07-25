/** Shared P0 interfaces. Keep these compatible with docs/p0-contract.md. */
export type ConsentStatus = 'carer_confirmation_required' | 'confirmed';
export type HandoverStatus = 'draft' | 'ready_to_share' | 'shared';
export type EventCategory = 'carer_note' | 'support_visit' | 'vitals' | 'mobility' | 'appointment';

export interface Patient {
  id: string;
  displayName: string;
  preferredName: string;
  dateOfBirth: string;
  primaryCarerName: string;
  relationshipToCarer: string;
  consentStatus: ConsentStatus;
}

export interface CareEvent {
  id: string;
  patientId: string;
  occurredAt: string;
  category: EventCategory;
  authorLabel: string;
  narrative: string;
}

/** A factual statement or explicitly unresolved item. Both must cite source event IDs. */
export interface SourcedStatement {
  id: string;
  text: string;
  sourceEventIds: CareEvent['id'][];
}

export interface Handover {
  id: string;
  patientId: Patient['id'];
  generatedAt: string;
  status: HandoverStatus;
  /** A source-cited overview; this prototype intentionally offers no clinical recommendation. */
  summary: SourcedStatement;
  claims: SourcedStatement[];
  unresolved: SourcedStatement[];
  sourceEventIds: CareEvent['id'][];
}

export interface ShareConfirmation {
  handoverId: Handover['id'];
  confirmedBy: string;
  confirmedAt: string;
  attestation: string;
}

export interface HandoverBundle {
  patient: Patient;
  handover: Handover;
  events: CareEvent[];
}

export interface ShareHandoverRequest {
  confirmation: ShareConfirmation;
}

export interface ShareHandoverResponse {
  handover: Handover;
  confirmation: ShareConfirmation;
  delivery: 'canned_demo' | 'remote';
}
