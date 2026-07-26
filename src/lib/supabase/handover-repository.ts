import type {
  CareEvent,
  Handover,
  HandoverBundle,
  Patient,
  ShareConfirmation,
  SourcedStatement,
} from '@/types/care';
import { generateDeterministicHandover } from '@/features/ai';

import { createSupabaseServerClient, type SupabaseServerClient } from './server-client';

type PatientRow = {
  id: string;
  display_name: string;
  date_of_birth: string;
  primary_carer_name: string;
  consent_status: Patient['consentStatus'];
};

type CareEventRow = {
  id: string;
  patient_id: string;
  occurred_at: string;
  category: CareEvent['category'];
  author_label: string;
  narrative: string;
  contributor_role?: CareEvent['contributorRole'];
  provenance?: CareEvent['provenance'];
  review_status?: CareEvent['reviewStatus'];
};

type HandoverRow = {
  id: string;
  patient_id: string;
  generated_at: string;
  status: Handover['status'];
  summary: string;
  source_event_ids: string[];
};

type HandoverClaimRow = {
  id: string;
  handover_id: string;
  kind: 'claim' | 'unresolved';
  text: string;
  source_event_ids: string[];
};

type ShareConfirmationRow = {
  id: string;
  handover_id: string;
  confirmed_by: string;
  confirmed_at: string;
  attestation: string;
};

export interface HandoverRepository {
  getBundle(handoverId: string): Promise<HandoverBundle | undefined>;
  saveBundle(bundle: HandoverBundle): Promise<void>;
  confirmAndShare(confirmation: ShareConfirmation): Promise<Handover | undefined>;
  appendReviewedEvent(handoverId: string, event: CareEvent): Promise<HandoverBundle | undefined>;
}

/**
 * Returns undefined without Supabase configuration. Callers should then use the
 * canned synthetic demo fallback rather than attempting network persistence.
 */
export function createHandoverRepository(): HandoverRepository | undefined {
  const client = createSupabaseServerClient();
  return client ? new RestHandoverRepository(client) : undefined;
}

class RestHandoverRepository implements HandoverRepository {
  constructor(private readonly client: SupabaseServerClient) {}

  async getBundle(handoverId: string): Promise<HandoverBundle | undefined> {
    const handover = await this.first<HandoverRow>(`handovers?id=eq.${encode(handoverId)}&select=*`);
    if (!handover) {
      return undefined;
    }

    const [patient, events, rows] = await Promise.all([
      this.first<PatientRow>(`patients?id=eq.${encode(handover.patient_id)}&select=*`),
      this.client.request<CareEventRow[]>(`care_events?patient_id=eq.${encode(handover.patient_id)}&select=*&order=occurred_at.asc`),
      this.client.request<HandoverClaimRow[]>(`handover_claims?handover_id=eq.${encode(handover.id)}&select=*`),
    ]);
    if (!patient) {
      return undefined;
    }

    return {
      patient: patientFromRow(patient),
      events: events.map(eventFromRow),
      handover: handoverFromRows(handover, rows),
    };
  }

  async saveBundle(bundle: HandoverBundle): Promise<void> {
    // P0 persists only fictional, deterministic demo fixtures.
    await this.upsert('patients', patientToRow(bundle.patient));
    await Promise.all(bundle.events.map((event) => this.upsert('care_events', eventToRow(event))));
    await this.upsert('handovers', handoverToRow(bundle.handover));

    await this.client.request(`handover_claims?handover_id=eq.${encode(bundle.handover.id)}`, { method: 'DELETE' });
    const claims = [
      ...bundle.handover.claims.map((statement) => statementToRow(bundle.handover.id, 'claim', statement)),
      ...bundle.handover.unresolved.map((statement) => statementToRow(bundle.handover.id, 'unresolved', statement)),
    ];
    if (claims.length > 0) {
      await this.client.request('handover_claims', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify(claims),
      });
    }
  }

  async confirmAndShare(confirmation: ShareConfirmation): Promise<Handover | undefined> {
    validateConfirmation(confirmation);
    const handover = await this.first<HandoverRow>(`handovers?id=eq.${encode(confirmation.handoverId)}&select=*`);
    if (!handover) {
      return undefined;
    }

    await this.upsert('share_confirmations', confirmationToRow(confirmation));
    const updated = await this.client.request<HandoverRow[]>(
      `handovers?id=eq.${encode(confirmation.handoverId)}&select=*`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ status: 'shared' }),
      },
    );
    const shared = updated[0];
    if (!shared) {
      return undefined;
    }
    const claims = await this.client.request<HandoverClaimRow[]>(
      `handover_claims?handover_id=eq.${encode(shared.id)}&select=*`,
    );
    return handoverFromRows(shared, claims);
  }

  async appendReviewedEvent(handoverId: string, event: CareEvent): Promise<HandoverBundle | undefined> {
    const existing = await this.getBundle(handoverId);
    if (!existing || existing.handover.status === 'shared' || existing.patient.id !== event.patientId || existing.events.some((item) => item.id === event.id)) return undefined;
    await this.client.request('care_events', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        id: event.id, patient_id: event.patientId, occurred_at: event.occurredAt, category: event.category, author_label: event.authorLabel, narrative: event.narrative,
        contributor_role: event.contributorRole, provenance: event.provenance, review_status: event.reviewStatus,
      }),
    });
    const nextEvents = [...existing.events, event];
    const nextBundle: HandoverBundle = {
      patient: existing.patient,
      events: nextEvents,
      handover: generateDeterministicHandover({ id: existing.handover.id, patientId: existing.patient.id, events: nextEvents, generatedAt: event.occurredAt, status: 'ready_to_share' }),
    };
    await this.saveBundle(nextBundle);
    return nextBundle;
  }

  private async first<T>(path: string): Promise<T | undefined> {
    const rows = await this.client.request<T[]>(path);
    return rows[0];
  }

  private async upsert(table: string, row: object): Promise<void> {
    await this.client.request(`${table}?on_conflict=id`, {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(row),
    });
  }
}

function patientFromRow(row: PatientRow): Patient {
  return {
    id: row.id,
    displayName: row.display_name,
    // These display-only fields are not present in the frozen P0 database schema.
    preferredName: row.display_name.split(' ')[0] ?? row.display_name,
    relationshipToCarer: 'not recorded',
    dateOfBirth: row.date_of_birth,
    primaryCarerName: row.primary_carer_name,
    consentStatus: row.consent_status,
  };
}

function patientToRow(patient: Patient): PatientRow {
  return {
    id: patient.id,
    display_name: patient.displayName,
    date_of_birth: patient.dateOfBirth,
    primary_carer_name: patient.primaryCarerName,
    consent_status: patient.consentStatus,
  };
}

function eventFromRow(row: CareEventRow): CareEvent {
  const inferredRole: CareEvent['contributorRole'] = row.author_label.toLowerCase().includes('daniel') ? 'family_informal_caregiver' : 'professional_caregiver';
  return {
    id: row.id,
    patientId: row.patient_id,
    occurredAt: row.occurred_at,
    category: row.category,
    authorLabel: row.author_label,
    narrative: row.narrative,
    contributorRole: row.contributor_role ?? inferredRole,
    provenance: row.provenance ?? 'typed',
    reviewStatus: row.review_status ?? 'reviewed_observation',
  };
}

/** Maps every required domain field to the additive care_events persistence schema. */
export function eventToRow(event: CareEvent): CareEventRow {
  return {
    id: event.id,
    patient_id: event.patientId,
    occurred_at: event.occurredAt,
    category: event.category,
    author_label: event.authorLabel,
    narrative: event.narrative,
    contributor_role: event.contributorRole,
    provenance: event.provenance,
    review_status: event.reviewStatus,
  };
}

function handoverFromRows(row: HandoverRow, statements: HandoverClaimRow[]): Handover {
  const toStatement = (statement: HandoverClaimRow): SourcedStatement => ({ id: statement.id, text: statement.text, sourceEventIds: statement.source_event_ids });
  return {
    id: row.id,
    patientId: row.patient_id,
    generatedAt: row.generated_at,
    status: row.status,
    summary: { id: `summary-${row.id}`, text: row.summary, sourceEventIds: row.source_event_ids },
    claims: statements.filter((statement) => statement.kind === 'claim').map(toStatement),
    unresolved: statements.filter((statement) => statement.kind === 'unresolved').map(toStatement),
    sourceEventIds: row.source_event_ids,
  };
}

function handoverToRow(handover: Handover): HandoverRow {
  return { id: handover.id, patient_id: handover.patientId, generated_at: handover.generatedAt, status: handover.status, summary: handover.summary.text, source_event_ids: handover.sourceEventIds };
}

function statementToRow(handoverId: string, kind: HandoverClaimRow['kind'], statement: SourcedStatement): HandoverClaimRow {
  return { id: statement.id, handover_id: handoverId, kind, text: statement.text, source_event_ids: statement.sourceEventIds };
}

function confirmationToRow(confirmation: ShareConfirmation): ShareConfirmationRow {
  return {
    id: `confirmation-${confirmation.handoverId}`,
    handover_id: confirmation.handoverId,
    confirmed_by: confirmation.confirmedBy,
    confirmed_at: confirmation.confirmedAt,
    attestation: confirmation.attestation,
  };
}

function validateConfirmation(confirmation: ShareConfirmation): void {
  if (!confirmation.confirmedBy.trim() || !confirmation.confirmedAt || !confirmation.attestation.trim()) {
    throw new Error('Carer confirmation, timestamp, and attestation are required before sharing.');
  }
}

function encode(value: string): string {
  return encodeURIComponent(value);
}
