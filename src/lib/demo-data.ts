import type { CareEvent, HandoverBundle } from '@/types/care';
import { generateDeterministicHandover } from '@/features/ai';

export const DEMO_PATIENT_ID = 'patient-demo-001';
export const DEMO_HANDOVER_ID = 'handover-demo-001';

/** Reliable, offline P0 fallback. Never replace this fixture with production patient data. */
export const demoEvents: CareEvent[] = [
  { id: 'evt-001', patientId: DEMO_PATIENT_ID, occurredAt: '2026-07-18T08:30:00.000Z', category: 'carer_note', authorLabel: 'Daniel Patel · carer note', narrative: 'Maya reported feeling more tired than usual after breakfast.' },
  { id: 'evt-002', patientId: DEMO_PATIENT_ID, occurredAt: '2026-07-18T12:10:00.000Z', category: 'support_visit', authorLabel: 'Leah Morgan · support visit', narrative: 'Morning tablets were present in the organiser; carer could not confirm they were taken.' },
  { id: 'evt-003', patientId: DEMO_PATIENT_ID, occurredAt: '2026-07-19T09:00:00.000Z', category: 'vitals', authorLabel: 'Leah Morgan · recorded observation', narrative: 'Blood pressure recorded as 132/78 mmHg.' },
  { id: 'evt-004', patientId: DEMO_PATIENT_ID, occurredAt: '2026-07-19T18:20:00.000Z', category: 'carer_note', authorLabel: 'Daniel Patel · carer note', narrative: 'Maya ate most of an evening meal and drank one glass of water.' },
  { id: 'evt-005', patientId: DEMO_PATIENT_ID, occurredAt: '2026-07-20T10:15:00.000Z', category: 'mobility', authorLabel: 'Daniel Patel · mobility note', narrative: 'Maya used her walking frame for an indoor walk with Daniel nearby.' },
  { id: 'evt-006', patientId: DEMO_PATIENT_ID, occurredAt: '2026-07-21T14:40:00.000Z', category: 'appointment', authorLabel: 'Daniel Patel · appointment note', narrative: 'Community nurse visit was scheduled for 2026-07-24; attendance not recorded.' },
  { id: 'evt-007', patientId: DEMO_PATIENT_ID, occurredAt: '2026-07-22T07:50:00.000Z', category: 'carer_note', authorLabel: 'Daniel Patel · carer note', narrative: 'Maya said she slept poorly overnight.' },
  { id: 'evt-008', patientId: DEMO_PATIENT_ID, occurredAt: '2026-07-22T16:30:00.000Z', category: 'support_visit', authorLabel: 'Leah Morgan · support visit', narrative: 'Afternoon check-in completed; no measurement recorded.' }
];

export const cannedDemoBundle: HandoverBundle = {
  patient: { id: DEMO_PATIENT_ID, displayName: 'Maya Patel', preferredName: 'Maya', dateOfBirth: '1948-11-02', primaryCarerName: 'Daniel Patel', relationshipToCarer: 'son', consentStatus: 'carer_confirmation_required' },
  events: demoEvents,
  handover: generateDeterministicHandover({ id: DEMO_HANDOVER_ID, patientId: DEMO_PATIENT_ID, events: demoEvents, generatedAt: '2026-07-22T17:00:00.000Z', status: 'ready_to_share' })
};
