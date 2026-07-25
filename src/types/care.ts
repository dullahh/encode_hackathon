/** Shared P0 interfaces. Keep these compatible with docs/p0-contract.md. */
export type ConsentStatus = 'carer_confirmation_required' | 'confirmed';
export type HandoverStatus = 'draft' | 'ready_to_share' | 'shared';
export type EventCategory = 'carer_note' | 'support_visit' | 'vitals' | 'mobility' | 'appointment' | 'clinical_encounter';
export type CareContributorRole = 'clinician' | 'professional_caregiver' | 'patient' | 'family_informal_caregiver';
export type EventProvenance = 'typed' | 'voice';
export type EventReviewStatus = 'reviewed_observation' | 'needs_clarification';
export type HandoverSection = 'recorded_updates' | 'observations' | 'daily_living' | 'mobility' | 'appointments';
export type HandoverGenerationMode = 'openai' | 'deterministic_fallback';
export type HandoverFallbackCategory = 'missing_configuration' | 'authentication_or_access' | 'unsupported_model_or_request' | 'network_failure' | 'provider_timeout' | 'response_parsing' | 'care_relay_validation';
export type ClinicalResolutionAction = 'corroborated' | 'clarified' | 'contradicted' | 'kept_open' | 'entered_in_error';
export type EpistemicStatus = 'open' | 'corroborated' | 'contradicted' | 'superseded' | 'entered_in_error';
export type ClinicalConditionStatus = 'active' | 'ongoing' | 'resolved' | 'unknown';

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
  contributorRole: CareContributorRole;
  provenance: EventProvenance;
  reviewStatus: EventReviewStatus;
}

/** Server-authenticated identity supplied by a future clinical identity provider; never client-selected. */
export interface AuthenticatedClinician {
  id: string;
  displayName: string;
  organisation?: string;
  role?: string;
  authenticated: true;
  authorisedForClinicalReview: true;
}

export interface ClinicalResolutionEvent {
  id: string;
  patientId: string;
  originalEventId: CareEvent['id'];
  action: ClinicalResolutionAction;
  clinician: AuthenticatedClinician;
  occurredAt: string;
  clinicalExplanation: string;
  supportingEvidence: string;
  clinicalConditionStatus: ClinicalConditionStatus;
}

/** Derived, non-destructive status of one original source event. */
export interface ResolutionState {
  originalEventId: CareEvent['id'];
  epistemicStatus: EpistemicStatus;
  clinicalConditionStatus: ClinicalConditionStatus;
  resolutionEventIds: ClinicalResolutionEvent['id'][];
}

/** A factual statement or explicitly unresolved item. Both must cite source event IDs. */
export interface SourcedStatement {
  id: string;
  text: string;
  sourceEventIds: CareEvent['id'][];
  /** Server-validated display grouping. It is never a clinical interpretation. */
  section?: HandoverSection;
}

/** Presentation metadata; deliberately not persisted with the source records. */
export interface HandoverGeneration {
  mode: HandoverGenerationMode;
  warnings: string[];
  /** Development-safe diagnostic metadata; never includes provider response content. */
  fallbackCategory?: HandoverFallbackCategory;
  providerStatus?: number;
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
  /** A later review never rewrites its ancestor snapshot. */
  version?: number;
  derivedFromHandoverId?: Handover['id'];
  resolutionStates?: ResolutionState[];
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
  generation?: HandoverGeneration;
}

export interface ShareHandoverRequest {
  confirmation: ShareConfirmation;
}

export interface ShareHandoverResponse {
  handover: Handover;
  confirmation: ShareConfirmation;
  delivery: 'canned_demo' | 'remote';
}
