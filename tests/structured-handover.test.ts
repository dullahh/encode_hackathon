import assert from 'node:assert/strict';
import test from 'node:test';

import { generateStructuredHandover, validateStructuredHandoverOutput, type StructuredHandoverProvider } from '@/features/ai/structured-handover';
import { cannedDemoBundle, cannedDraftBundle, demoEvents } from '@/lib/demo-data';
import { hasTraceableEvidence } from '@/lib/handover';
import { confirmLocalDemoDraft, createTemporaryShare, TemporaryShareError } from '@/lib/temporary-shares';
import { addReviewedEventToHandover, canCreateTemporaryShare, canPrepareIntake, createReviewedCareEvent } from '@/features/intake/reviewed-event';
import { appendClinicalResolution, createDerivedHandoverSnapshot, deriveResolutionState, type ClinicalReviewActor } from '@/features/resolution/resolution-lifecycle';
import { generateDeterministicHandover } from '@/features/ai';
import type { CareEvent } from '@/types/care';

const input = {
  id: cannedDemoBundle.handover.id,
  patientId: cannedDemoBundle.patient.id,
  events: demoEvents,
  generatedAt: cannedDemoBundle.handover.generatedAt,
  status: cannedDemoBundle.handover.status,
} as const;

const validOutput = {
  claims: [
    { section: 'recorded_updates', sourceEventIds: ['evt-001'] },
    { section: 'observations', sourceEventIds: ['evt-003'] },
    { section: 'recorded_updates', sourceEventIds: ['evt-004'] },
    { section: 'mobility', sourceEventIds: ['evt-005'] },
    { section: 'recorded_updates', sourceEventIds: ['evt-007'] },
  ],
  unresolved: [
    { reason: 'uncertain_or_incomplete', sourceEventIds: ['evt-002'] },
    { reason: 'uncertain_or_incomplete', sourceEventIds: ['evt-006'] },
    { reason: 'uncertain_or_incomplete', sourceEventIds: ['evt-008'] },
  ],
};

const provider = (output: unknown): StructuredHandoverProvider => ({ generate: async () => output });

test('accepts a valid structured result and keeps every displayed claim source-linked', async () => {
  const result = await generateStructuredHandover(input, provider({ ...validOutput, claims: [...validOutput.claims].reverse() }));
  assert.equal(result.generation.mode, 'openai');
  assert.equal(result.generation.warnings.length, 0);
  assert.deepEqual(result.handover.claims.map((claim) => claim.sourceEventIds), [['evt-001'], ['evt-003'], ['evt-004'], ['evt-005'], ['evt-007']]);
  assert.ok(hasTraceableEvidence(result.handover, demoEvents));
});

test('rejects an invented source ID and activates the deterministic fallback', async () => {
  const unsafe = { ...validOutput, claims: [{ section: 'recorded_updates', sourceEventIds: ['evt-invented'] }, ...validOutput.claims.slice(1)] };
  const result = await generateStructuredHandover(input, provider(unsafe));
  assert.equal(result.generation.mode, 'deterministic_fallback');
  assert.equal(result.generation.fallbackCategory, 'care_relay_validation');
  assert.match(result.generation.warnings[0], /evidence validation/i);
});

test('rejects a claim without a source ID', () => {
  const unsafe = { ...validOutput, claims: [{ section: 'recorded_updates', sourceEventIds: [] }, ...validOutput.claims.slice(1)] };
  assert.ok(validateStructuredHandoverOutput(unsafe, demoEvents).length > 0);
});

test('rejects malformed structured output and falls back', async () => {
  const result = await generateStructuredHandover(input, provider({ claims: 'not-an-array' }));
  assert.equal(result.generation.mode, 'deterministic_fallback');
});

test('keeps missing or uncertain evidence unresolved when a provider attempts to promote it', async () => {
  const unsafe = {
    ...validOutput,
    claims: [...validOutput.claims, { section: 'daily_living', sourceEventIds: ['evt-002'] }],
    unresolved: validOutput.unresolved.filter((item) => item.sourceEventIds[0] !== 'evt-002'),
  };
  const result = await generateStructuredHandover(input, provider(unsafe));
  assert.equal(result.generation.mode, 'deterministic_fallback');
  assert.ok(result.handover.unresolved.some((item) => item.sourceEventIds.includes('evt-002')));
});

test('handles provider timeout or failure through the deterministic fallback', async () => {
  const unavailable: StructuredHandoverProvider = { generate: async () => { throw new Error('simulated timeout'); } };
  const result = await generateStructuredHandover(input, unavailable);
  assert.equal(result.generation.mode, 'deterministic_fallback');
  assert.equal(result.generation.fallbackCategory, 'network_failure');
  assert.match(result.generation.warnings[0], /unavailable or timed out/i);
});

test('fallback output is stable for identical source input', async () => {
  const unavailable: StructuredHandoverProvider = { generate: async () => { throw new Error('simulated provider failure'); } };
  const [first, second] = await Promise.all([generateStructuredHandover(input, unavailable), generateStructuredHandover(input, unavailable)]);
  assert.deepEqual(first, second);
});

test('confirmation and QR creation remain gated before any persistence call', async () => {
  await assert.rejects(
    createTemporaryShare(cannedDemoBundle.handover.id, 'http://localhost:3000', undefined),
    (error: unknown) => error instanceof TemporaryShareError && error.status === 403,
  );
});

const voiceDraft = { text: 'A synthetic voice observation for review.', category: 'carer_note' as const, contributorRole: 'family_informal_caregiver' as const, provenance: 'voice' as const };
const clinicalReviewer = { id: 'clinician-demo-001', displayName: 'Dr Taylor Reed', organisation: 'Synthetic GP Practice', role: 'GP', authenticated: true as const, authorisedForClinicalReview: true as const };
const unauthorisedActor: ClinicalReviewActor = { authenticated: false, authorisedForClinicalReview: false };
const reviewedNegativeObservation: CareEvent = { id: 'evt-resolution-001', patientId: cannedDraftBundle.patient.id, occurredAt: '2026-07-22T17:20:00.000Z', category: 'mobility', authorLabel: 'Samira Khan · family/informal caregiver', narrative: 'Aisha cannot walk unaided.', contributorRole: 'family_informal_caregiver', provenance: 'voice', reviewStatus: 'reviewed_observation' };
const needsClarificationObservation: CareEvent = { id: 'evt-resolution-002', patientId: cannedDraftBundle.patient.id, occurredAt: '2026-07-22T17:21:00.000Z', category: 'carer_note', authorLabel: 'Samira Khan · family/informal caregiver', narrative: 'Aisha cannot recall her last dosage.', contributorRole: 'family_informal_caregiver', provenance: 'voice', reviewStatus: 'needs_clarification' };

function resolutionInput(originalEventId: string, action: 'corroborated' | 'clarified' | 'contradicted' | 'kept_open' | 'entered_in_error' = 'clarified') {
  return { id: `resolution-${action}-001`, originalEventId, action, occurredAt: '2026-07-22T18:00:00.000Z', clinicalExplanation: 'Synthetic clinical review recorded a clarification.', supportingEvidence: 'Synthetic GP consultation record.', clinicalConditionStatus: 'ongoing' as const };
}

test('an unreviewed transcript changes nothing', () => {
  assert.throws(() => createReviewedCareEvent(cannedDemoBundle.patient, voiceDraft, { id: 'evt-intake-001', occurredAt: '2026-07-22T17:10:00.000Z' }));
  assert.equal(cannedDemoBundle.events.length, 8);
});

test('discarding a voice draft changes nothing', () => {
  const discardedDraft = { ...voiceDraft };
  void discardedDraft;
  assert.equal(cannedDemoBundle.events.length, 8);
  assert.equal(cannedDemoBundle.handover.sourceEventIds.length, 8);
});

test('an approved voice draft creates one traceable source event in the reviewed timeline', () => {
  const result = addReviewedEventToHandover(cannedDemoBundle.patient, cannedDemoBundle.handover, cannedDemoBundle.events, { ...voiceDraft, reviewStatus: 'reviewed_observation' }, { id: 'evt-intake-001', occurredAt: '2026-07-22T17:10:00.000Z' });
  assert.equal(result.events.length, 9);
  assert.equal(result.event.provenance, 'voice');
  assert.equal(result.event.contributorRole, 'family_informal_caregiver');
  assert.ok(result.handover.sourceEventIds.includes(result.event.id));
  assert.ok(result.events.some((event) => event.id === result.event.id));
});

test('typed intake follows the same reviewed source-event pipeline', () => {
  const result = addReviewedEventToHandover(cannedDemoBundle.patient, cannedDemoBundle.handover, cannedDemoBundle.events, { text: 'A synthetic typed observation for review.', category: 'support_visit', contributorRole: 'professional_caregiver', provenance: 'typed', reviewStatus: 'reviewed_observation' }, { id: 'evt-intake-001', occurredAt: '2026-07-22T17:10:00.000Z' });
  assert.equal(result.event.provenance, 'typed');
  assert.equal(result.events.length, 9);
});

test('needs clarification remains in unresolved rather than a factual claim', () => {
  const result = addReviewedEventToHandover(cannedDemoBundle.patient, cannedDemoBundle.handover, cannedDemoBundle.events, { ...voiceDraft, reviewStatus: 'needs_clarification' }, { id: 'evt-intake-001', occurredAt: '2026-07-22T17:10:00.000Z' });
  assert.ok(result.handover.unresolved.some((item) => item.sourceEventIds.includes('evt-intake-001')));
  assert.ok(!result.handover.claims.some((item) => item.sourceEventIds.includes('evt-intake-001')));
});

test('confirmation enables the existing temporary-share UI gate only when no local-only event exists', () => {
  assert.equal(canCreateTemporaryShare(cannedDemoBundle.handover, false), false);
  assert.equal(canCreateTemporaryShare({ ...cannedDemoBundle.handover, status: 'shared' }, false), true);
  assert.equal(canCreateTemporaryShare({ ...cannedDemoBundle.handover, status: 'shared' }, true), false);
});

test('the separately started synthetic handover begins unconfirmed and accepts reviewed intake', () => {
  assert.equal(cannedDraftBundle.handover.status, 'draft');
  assert.equal(canPrepareIntake(cannedDraftBundle.handover), true);
  const result = addReviewedEventToHandover(cannedDraftBundle.patient, cannedDraftBundle.handover, cannedDraftBundle.events, { ...voiceDraft, reviewStatus: 'reviewed_observation' }, { id: 'evt-intake-001', occurredAt: '2026-07-22T17:10:00.000Z' });
  assert.equal(result.events.length, 2);
  assert.equal(result.handover.status, 'ready_to_share');
});

test('a draft cannot be shared before confirmation and becomes immutable/shareable after confirmation', async () => {
  assert.equal(canCreateTemporaryShare(cannedDraftBundle.handover, false), false);
  const confirmation = { handoverId: cannedDraftBundle.handover.id, confirmedBy: cannedDraftBundle.patient.primaryCarerName, confirmedAt: '2026-07-22T17:05:00.000Z', attestation: 'I confirm this handover may be shared.' };
  await assert.rejects(createTemporaryShare(cannedDraftBundle.handover.id, 'http://localhost:3000', confirmation), (error: unknown) => error instanceof TemporaryShareError && error.status === 403);
  const confirmedDraft = { ...cannedDraftBundle.handover, status: 'shared' as const };
  assert.equal(canPrepareIntake(confirmedDraft), false);
  assert.equal(canCreateTemporaryShare(confirmedDraft, false), true);
  confirmLocalDemoDraft(cannedDraftBundle.handover.id);
  const share = await createTemporaryShare(cannedDraftBundle.handover.id, 'http://localhost:3000', confirmation);
  assert.equal(share.delivery, 'local_demo');
});

test('a reviewed negative observation is a claim while needs clarification remains unresolved', () => {
  const reviewed = generateDeterministicHandover({ id: 'handover-resolution-reviewed', patientId: cannedDraftBundle.patient.id, events: [reviewedNegativeObservation], generatedAt: reviewedNegativeObservation.occurredAt });
  const clarification = generateDeterministicHandover({ id: 'handover-resolution-open', patientId: cannedDraftBundle.patient.id, events: [needsClarificationObservation], generatedAt: needsClarificationObservation.occurredAt });
  assert.ok(reviewed.claims.some((statement) => statement.sourceEventIds.includes(reviewedNegativeObservation.id)));
  assert.equal(reviewed.unresolved.length, 0);
  assert.ok(clarification.unresolved.some((statement) => statement.sourceEventIds.includes(needsClarificationObservation.id)));
  assert.equal(clarification.claims.length, 0);
});

test('a resolution references and preserves the original immutable source event', () => {
  const originals = [needsClarificationObservation];
  const before = structuredClone(originals);
  const resolution = appendClinicalResolution(originals, [], clinicalReviewer, resolutionInput(needsClarificationObservation.id));
  assert.equal(resolution.originalEventId, needsClarificationObservation.id);
  assert.equal(resolution.clinician.id, clinicalReviewer.id);
  assert.deepEqual(originals, before);
});

test('clarification does not mutate or delete the original report', () => {
  const resolution = appendClinicalResolution([needsClarificationObservation], [], clinicalReviewer, resolutionInput(needsClarificationObservation.id, 'clarified'));
  const state = deriveResolutionState(needsClarificationObservation.id, [resolution]);
  assert.equal(needsClarificationObservation.narrative, 'Aisha cannot recall her last dosage.');
  assert.equal(state.epistemicStatus, 'superseded');
  assert.deepEqual(state.resolutionEventIds, [resolution.id]);
});

test('contradiction preserves both accounts and their provenance', () => {
  const resolution = appendClinicalResolution([needsClarificationObservation], [], clinicalReviewer, { ...resolutionInput(needsClarificationObservation.id, 'contradicted'), id: 'resolution-contradicted-001', clinicalExplanation: 'Synthetic clinician account differs from the original caregiver report.' });
  const state = deriveResolutionState(needsClarificationObservation.id, [resolution]);
  assert.equal(needsClarificationObservation.provenance, 'voice');
  assert.equal(needsClarificationObservation.contributorRole, 'family_informal_caregiver');
  assert.equal(resolution.clinician.displayName, clinicalReviewer.displayName);
  assert.equal(state.epistemicStatus, 'contradicted');
});

test('entered-in-error requires a reason', () => {
  assert.throws(() => appendClinicalResolution([needsClarificationObservation], [], clinicalReviewer, { ...resolutionInput(needsClarificationObservation.id, 'entered_in_error'), clinicalExplanation: '   ' }), /Clinical explanation is required/);
});

test('QR-token recipients and unauthorised users cannot append clinical resolutions', () => {
  assert.throws(() => appendClinicalResolution([needsClarificationObservation], [], unauthorisedActor, resolutionInput(needsClarificationObservation.id)), /authenticated and authorised clinician/);
  const qrRecipient: ClinicalReviewActor = { authenticated: false, authorisedForClinicalReview: false };
  assert.throws(() => appendClinicalResolution([needsClarificationObservation], [], qrRecipient, resolutionInput(needsClarificationObservation.id)), /authenticated and authorised clinician/);
});

test('later clinical review leaves a confirmed snapshot unchanged and creates a derived version', () => {
  const prior = generateDeterministicHandover({ id: 'handover-confirmed-001', patientId: cannedDraftBundle.patient.id, events: [needsClarificationObservation], generatedAt: needsClarificationObservation.occurredAt, status: 'shared' });
  const before = structuredClone(prior);
  const resolution = appendClinicalResolution([needsClarificationObservation], [], clinicalReviewer, resolutionInput(needsClarificationObservation.id, 'corroborated'));
  const derived = createDerivedHandoverSnapshot(prior, [needsClarificationObservation], [resolution], { id: 'handover-derived-002', generatedAt: resolution.occurredAt });
  assert.deepEqual(prior, before);
  assert.equal(derived.derivedFromHandoverId, prior.id);
  assert.equal(derived.version, 2);
  assert.equal(derived.status, 'draft');
  assert.deepEqual(derived.resolutionStates?.[0], { originalEventId: needsClarificationObservation.id, epistemicStatus: 'corroborated', clinicalConditionStatus: 'ongoing', resolutionEventIds: [resolution.id] });
});

test('OpenAI cannot override explicit human review outcome or resolution status', async () => {
  const forcedClaim = { claims: [{ section: 'recorded_updates', sourceEventIds: [needsClarificationObservation.id] }], unresolved: [] };
  const result = await generateStructuredHandover({ id: 'handover-openai-review-001', patientId: cannedDraftBundle.patient.id, events: [needsClarificationObservation], generatedAt: needsClarificationObservation.occurredAt, status: 'draft' }, provider(forcedClaim));
  assert.equal(result.generation.mode, 'deterministic_fallback');
  assert.ok(result.handover.unresolved.some((statement) => statement.sourceEventIds.includes(needsClarificationObservation.id)));
  const resolution = appendClinicalResolution([needsClarificationObservation], [], clinicalReviewer, resolutionInput(needsClarificationObservation.id, 'kept_open'));
  assert.equal(deriveResolutionState(needsClarificationObservation.id, [resolution]).epistemicStatus, 'open');
});
