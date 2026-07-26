import assert from 'node:assert/strict';
import test from 'node:test';

import { eventToRow } from '@/lib/supabase/handover-repository';
import type { CareEvent } from '@/types/care';

function event(reviewStatus: CareEvent['reviewStatus'], provenance: CareEvent['provenance']): CareEvent {
  return {
    id: `evt-row-${reviewStatus}`,
    patientId: 'patient-demo-draft-001',
    occurredAt: '2026-07-22T17:10:00.000Z',
    category: 'carer_note',
    authorLabel: 'Care contributor · Family/informal caregiver',
    narrative: 'Synthetic reviewed source observation.',
    contributorRole: 'family_informal_caregiver',
    provenance,
    reviewStatus,
  };
}

test('maps every required persistence field for a reviewed observation', () => {
  assert.deepEqual(eventToRow(event('reviewed_observation', 'typed')), {
    id: 'evt-row-reviewed_observation',
    patient_id: 'patient-demo-draft-001',
    occurred_at: '2026-07-22T17:10:00.000Z',
    category: 'carer_note',
    author_label: 'Care contributor · Family/informal caregiver',
    narrative: 'Synthetic reviewed source observation.',
    contributor_role: 'family_informal_caregiver',
    provenance: 'typed',
    review_status: 'reviewed_observation',
  });
});

test('maps every required persistence field for a needs-clarification voice observation', () => {
  assert.deepEqual(eventToRow(event('needs_clarification', 'voice')), {
    id: 'evt-row-needs_clarification',
    patient_id: 'patient-demo-draft-001',
    occurred_at: '2026-07-22T17:10:00.000Z',
    category: 'carer_note',
    author_label: 'Care contributor · Family/informal caregiver',
    narrative: 'Synthetic reviewed source observation.',
    contributor_role: 'family_informal_caregiver',
    provenance: 'voice',
    review_status: 'needs_clarification',
  });
});
