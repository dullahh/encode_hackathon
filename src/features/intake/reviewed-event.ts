import type { CareContributorRole, CareEvent, EventCategory, EventProvenance, EventReviewStatus, Handover, Patient } from '@/types/care';
import { generateDeterministicHandover } from '@/features/ai';

export interface IntakeDraft {
  text: string;
  category: EventCategory;
  contributorRole: CareContributorRole;
  provenance: EventProvenance;
  reviewStatus?: EventReviewStatus;
}

export interface ReviewedEventOptions {
  id: string;
  occurredAt: string;
}

export const CONTRIBUTOR_ROLE_LABELS: Record<CareContributorRole, string> = {
  clinician: 'Clinician',
  professional_caregiver: 'Professional caregiver',
  patient: 'Patient',
  family_informal_caregiver: 'Family/informal caregiver',
};

/** UI gate only; the server QR route still independently enforces confirmation. */
export function canCreateTemporaryShare(handover: Handover, hasLocalAdditions: boolean): boolean {
  return handover.status === 'shared' && !hasLocalAdditions;
}

export function canPrepareIntake(handover: Handover): boolean {
  return handover.status === 'draft' || handover.status === 'ready_to_share';
}

export function createReviewedCareEvent(patient: Patient, draft: IntakeDraft, options: ReviewedEventOptions): CareEvent {
  const narrative = draft.text.trim();
  if (!narrative) throw new Error('A reviewed observation needs text before it can be added.');
  if (!draft.reviewStatus) throw new Error('Choose Reviewed observation or Needs clarification before adding.');
  if (!options.id.trim() || !options.occurredAt) throw new Error('A stable source event ID and timestamp are required.');
  return {
    id: options.id,
    patientId: patient.id,
    occurredAt: new Date(options.occurredAt).toISOString(),
    category: draft.category,
    authorLabel: `Care contributor · ${CONTRIBUTOR_ROLE_LABELS[draft.contributorRole]}`,
    narrative,
    contributorRole: draft.contributorRole,
    provenance: draft.provenance,
    reviewStatus: draft.reviewStatus,
  };
}

/** Adds one explicitly reviewed source event and rebuilds the evidence-led handover. */
export function addReviewedEventToHandover(patient: Patient, handover: Handover, events: readonly CareEvent[], draft: IntakeDraft, options: ReviewedEventOptions): { event: CareEvent; events: CareEvent[]; handover: Handover } {
  const event = createReviewedCareEvent(patient, draft, options);
  if (events.some((item) => item.id === event.id)) throw new Error('Source event IDs must be unique.');
  const nextEvents = [...events, event];
  const nextHandover = generateDeterministicHandover({
    id: handover.id,
    patientId: patient.id,
    events: nextEvents,
    generatedAt: event.occurredAt,
    status: 'ready_to_share',
  });
  return { event, events: nextEvents, handover: nextHandover };
}
