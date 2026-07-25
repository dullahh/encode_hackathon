import 'server-only';

import { generateDeterministicHandover } from '@/features/ai';
import type {
  AuthenticatedClinician,
  CareEvent,
  ClinicalConditionStatus,
  ClinicalResolutionAction,
  ClinicalResolutionEvent,
  EpistemicStatus,
  Handover,
  ResolutionState,
} from '@/types/care';

export type ClinicalReviewActor = AuthenticatedClinician | { authenticated: false; authorisedForClinicalReview: false };

export interface ResolutionInput {
  id: string;
  originalEventId: string;
  action: ClinicalResolutionAction;
  occurredAt: string;
  clinicalExplanation: string;
  supportingEvidence: string;
  clinicalConditionStatus: ClinicalConditionStatus;
}

export interface ClinicianEncounterInput {
  id: string;
  occurredAt: string;
  narrative: string;
}

const EPISTEMIC_STATUS: Record<ClinicalResolutionAction, EpistemicStatus> = {
  corroborated: 'corroborated',
  clarified: 'superseded',
  contradicted: 'contradicted',
  kept_open: 'open',
  entered_in_error: 'entered_in_error',
};

function assertAuthorisedClinician(actor: ClinicalReviewActor): asserts actor is AuthenticatedClinician {
  if (!actor.authenticated || !actor.authorisedForClinicalReview || !actor.id.trim() || !actor.displayName.trim()) {
    throw new Error('An authenticated and authorised clinician is required to append a clinical resolution.');
  }
}

function nonEmpty(value: string, name: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${name} is required.`);
  return trimmed;
}

function canonicalTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error('A valid resolution timestamp is required.');
  return parsed.toISOString();
}

/** Appends attributable review evidence; it cannot mutate or remove the original source event. */
export function appendClinicalResolution(
  events: readonly CareEvent[],
  resolutions: readonly ClinicalResolutionEvent[],
  actor: ClinicalReviewActor,
  input: ResolutionInput,
): ClinicalResolutionEvent {
  assertAuthorisedClinician(actor);
  const original = events.find((event) => event.id === input.originalEventId);
  if (!original) throw new Error('A clinical resolution must reference an existing original source event.');
  if (resolutions.some((resolution) => resolution.id === input.id)) throw new Error('Resolution event IDs must be unique.');
  const explanation = nonEmpty(input.clinicalExplanation, 'Clinical explanation');
  const supportingEvidence = nonEmpty(input.supportingEvidence, 'Supporting evidence or source');
  if (input.action === 'entered_in_error' && !explanation) throw new Error('Entered-in-error requires a reason.');

  return {
    id: nonEmpty(input.id, 'Resolution event ID'),
    patientId: original.patientId,
    originalEventId: original.id,
    action: input.action,
    clinician: actor,
    occurredAt: canonicalTimestamp(input.occurredAt),
    clinicalExplanation: explanation,
    supportingEvidence,
    clinicalConditionStatus: input.clinicalConditionStatus,
  };
}

/** A separately attributable clinician encounter; it is not a mutation of an earlier report. */
export function createClinicianEncounterEvent(
  patientId: string,
  actor: ClinicalReviewActor,
  input: ClinicianEncounterInput,
): CareEvent {
  assertAuthorisedClinician(actor);
  return {
    id: nonEmpty(input.id, 'Encounter event ID'),
    patientId,
    occurredAt: canonicalTimestamp(input.occurredAt),
    category: 'clinical_encounter',
    authorLabel: `${actor.displayName}${actor.role ? ` · ${actor.role}` : ''}${actor.organisation ? ` · ${actor.organisation}` : ''}`,
    narrative: nonEmpty(input.narrative, 'Encounter narrative'),
    contributorRole: 'clinician',
    provenance: 'typed',
    reviewStatus: 'reviewed_observation',
  };
}

/** Resolves the current state from immutable original evidence plus ordered resolution history. */
export function deriveResolutionState(originalEventId: string, resolutions: readonly ClinicalResolutionEvent[]): ResolutionState {
  const history = resolutions
    .filter((resolution) => resolution.originalEventId === originalEventId)
    .slice()
    .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) || left.id.localeCompare(right.id));
  const latest = history.at(-1);
  return {
    originalEventId,
    epistemicStatus: latest ? EPISTEMIC_STATUS[latest.action] : 'open',
    clinicalConditionStatus: latest?.clinicalConditionStatus ?? 'unknown',
    resolutionEventIds: history.map((resolution) => resolution.id),
  };
}

/** Creates a new derived snapshot, preserving the original confirmed handover object unchanged. */
export function createDerivedHandoverSnapshot(
  prior: Handover,
  events: readonly CareEvent[],
  resolutions: readonly ClinicalResolutionEvent[],
  options: { id: string; generatedAt: string },
): Handover {
  if (events.some((event) => event.patientId !== prior.patientId)) throw new Error('Derived snapshot events must belong to the original patient.');
  const generated = generateDeterministicHandover({
    id: nonEmpty(options.id, 'Derived handover ID'),
    patientId: prior.patientId,
    events,
    generatedAt: canonicalTimestamp(options.generatedAt),
    status: 'draft',
  });
  const originalEventIds = new Set(events.map((event) => event.id));
  const resolutionStates = [...new Set(resolutions.map((resolution) => resolution.originalEventId))]
    .filter((eventId) => originalEventIds.has(eventId))
    .sort()
    .map((eventId) => deriveResolutionState(eventId, resolutions));
  return {
    ...generated,
    version: (prior.version ?? 1) + 1,
    derivedFromHandoverId: prior.id,
    resolutionStates,
  };
}
