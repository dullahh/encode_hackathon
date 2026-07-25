import { generateDeterministicHandover } from '@/features/ai';
import type { CareEvent, HandoverBundle } from '@/types/care';

export const DEMO_PATIENT_ID = 'patient-demo-001';
export const DEMO_HANDOVER_ID = 'handover-demo-001';
export const DEMO_DRAFT_PATIENT_ID = 'patient-demo-draft-001';
export const DEMO_DRAFT_HANDOVER_ID = 'handover-demo-draft-001';

/** Reliable, offline P0 fallback. Never replace this fixture with production patient data. */
export const demoEvents: CareEvent[] = [
  { id: 'evt-001', patientId: DEMO_PATIENT_ID, occurredAt: '2026-07-18T08:30:00.000Z', category: 'carer_note', authorLabel: 'Daniel Patel · family/informal caregiver', narrative: 'Maya reported feeling more tired than usual after breakfast.', contributorRole: 'family_informal_caregiver', provenance: 'typed', reviewStatus: 'reviewed_observation' },
  { id: 'evt-002', patientId: DEMO_PATIENT_ID, occurredAt: '2026-07-18T12:10:00.000Z', category: 'support_visit', authorLabel: 'Leah Morgan · professional caregiver', narrative: 'Morning tablets were present in the organiser; carer could not confirm they were taken.', contributorRole: 'professional_caregiver', provenance: 'typed', reviewStatus: 'needs_clarification' },
  { id: 'evt-003', patientId: DEMO_PATIENT_ID, occurredAt: '2026-07-19T09:00:00.000Z', category: 'vitals', authorLabel: 'Leah Morgan · professional caregiver', narrative: 'Blood pressure recorded as 132/78 mmHg.', contributorRole: 'professional_caregiver', provenance: 'typed', reviewStatus: 'reviewed_observation' },
  { id: 'evt-004', patientId: DEMO_PATIENT_ID, occurredAt: '2026-07-19T18:20:00.000Z', category: 'carer_note', authorLabel: 'Daniel Patel · family/informal caregiver', narrative: 'Maya ate most of an evening meal and drank one glass of water.', contributorRole: 'family_informal_caregiver', provenance: 'typed', reviewStatus: 'reviewed_observation' },
  { id: 'evt-005', patientId: DEMO_PATIENT_ID, occurredAt: '2026-07-20T10:15:00.000Z', category: 'mobility', authorLabel: 'Daniel Patel · family/informal caregiver', narrative: 'Maya used her walking frame for an indoor walk with Daniel nearby.', contributorRole: 'family_informal_caregiver', provenance: 'typed', reviewStatus: 'reviewed_observation' },
  { id: 'evt-006', patientId: DEMO_PATIENT_ID, occurredAt: '2026-07-21T14:40:00.000Z', category: 'appointment', authorLabel: 'Daniel Patel · family/informal caregiver', narrative: 'Community nurse visit was scheduled for 2026-07-24; attendance not recorded.', contributorRole: 'family_informal_caregiver', provenance: 'typed', reviewStatus: 'needs_clarification' },
  { id: 'evt-007', patientId: DEMO_PATIENT_ID, occurredAt: '2026-07-22T07:50:00.000Z', category: 'carer_note', authorLabel: 'Daniel Patel · family/informal caregiver', narrative: 'Maya said she slept poorly overnight.', contributorRole: 'family_informal_caregiver', provenance: 'typed', reviewStatus: 'reviewed_observation' },
  { id: 'evt-008', patientId: DEMO_PATIENT_ID, occurredAt: '2026-07-22T16:30:00.000Z', category: 'support_visit', authorLabel: 'Leah Morgan · professional caregiver', narrative: 'Afternoon check-in completed; no measurement recorded.', contributorRole: 'professional_caregiver', provenance: 'typed', reviewStatus: 'needs_clarification' },
];

export const cannedDemoBundle: HandoverBundle = {
  patient: { id: DEMO_PATIENT_ID, displayName: 'Maya Patel', preferredName: 'Maya', dateOfBirth: '1948-11-02', primaryCarerName: 'Daniel Patel', relationshipToCarer: 'son', consentStatus: 'carer_confirmation_required' },
  events: demoEvents,
  handover: generateDeterministicHandover({ id: DEMO_HANDOVER_ID, patientId: DEMO_PATIENT_ID, events: demoEvents, generatedAt: '2026-07-22T17:00:00.000Z', status: 'ready_to_share' }),
};

/** Separate synthetic draft used only after the person preparing the handover explicitly starts it. */
export const cannedDraftBundle: HandoverBundle = {
  patient: { id: DEMO_DRAFT_PATIENT_ID, displayName: 'Aisha Khan', preferredName: 'Aisha', dateOfBirth: '1956-03-14', primaryCarerName: 'Samira Khan', relationshipToCarer: 'daughter', consentStatus: 'carer_confirmation_required' },
  events: [{ id: 'evt-draft-001', patientId: DEMO_DRAFT_PATIENT_ID, occurredAt: '2026-07-22T17:00:00.000Z', category: 'carer_note', authorLabel: 'CareRelay · draft setup', narrative: 'Synthetic draft handover opened for reviewed contributions.', contributorRole: 'family_informal_caregiver', provenance: 'typed', reviewStatus: 'needs_clarification' }],
  handover: generateDeterministicHandover({ id: DEMO_DRAFT_HANDOVER_ID, patientId: DEMO_DRAFT_PATIENT_ID, events: [{ id: 'evt-draft-001', patientId: DEMO_DRAFT_PATIENT_ID, occurredAt: '2026-07-22T17:00:00.000Z', category: 'carer_note', authorLabel: 'CareRelay · draft setup', narrative: 'Synthetic draft handover opened for reviewed contributions.', contributorRole: 'family_informal_caregiver', provenance: 'typed', reviewStatus: 'needs_clarification' }], generatedAt: '2026-07-22T17:00:00.000Z', status: 'draft' }),
};
