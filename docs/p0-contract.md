# CareRelay P0 contract freeze

Status: frozen for P0. All data in this document is fictional and deterministic.

## Patient

| Field | Value |
| --- | --- |
| `id` | `patient-demo-001` |
| name | Maya Patel |
| preferredName | Maya |
| dateOfBirth | 1948-11-02 |
| consentStatus | `carer_confirmation_required` |
| primaryCarer | Daniel Patel (son) |

## Source events (8)

1. `evt-001` — 2026-07-18 08:30, carer note: Maya reported feeling more tired than usual after breakfast.
2. `evt-002` — 2026-07-18 12:10, support visit: morning tablets were present in the organiser; carer could not confirm they were taken.
3. `evt-003` — 2026-07-19 09:00, vitals entry: blood pressure recorded as 132/78 mmHg.
4. `evt-004` — 2026-07-19 18:20, carer note: Maya ate most of an evening meal and drank one glass of water.
5. `evt-005` — 2026-07-20 10:15, mobility note: Maya used her walking frame for an indoor walk with Daniel nearby.
6. `evt-006` — 2026-07-21 14:40, appointment note: community nurse visit was scheduled for 2026-07-24; attendance not recorded.
7. `evt-007` — 2026-07-22 07:50, carer note: Maya said she slept poorly overnight.
8. `evt-008` — 2026-07-22 16:30, support visit: afternoon check-in completed; no measurement recorded.

## Handover JSON schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "CareRelayHandover",
  "type": "object",
  "required": ["id", "patientId", "generatedAt", "status", "summary", "claims", "unresolved", "sourceEventIds"],
  "properties": {
    "id": { "type": "string" },
    "patientId": { "type": "string" },
    "generatedAt": { "type": "string", "format": "date-time" },
    "status": { "enum": ["draft", "ready_to_share", "shared"] },
    "summary": { "type": "string" },
    "claims": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "text", "sourceEventIds"],
        "properties": {
          "id": { "type": "string" },
          "text": { "type": "string" },
          "sourceEventIds": { "type": "array", "minItems": 1, "items": { "type": "string" } }
        }
      }
    },
    "unresolved": { "type": "array", "items": { "type": "object", "required": ["id", "text", "sourceEventIds"], "properties": { "id": { "type": "string" }, "text": { "type": "string" }, "sourceEventIds": { "type": "array", "minItems": 1, "items": { "type": "string" } } } } },
    "sourceEventIds": { "type": "array", "minItems": 1, "items": { "type": "string" } }
  }
}
```

## Database schema

```sql
create type consent_status as enum ('carer_confirmation_required', 'confirmed');
create type handover_status as enum ('draft', 'ready_to_share', 'shared');

create table patients (id text primary key, display_name text not null, date_of_birth date not null, primary_carer_name text not null, consent_status consent_status not null default 'carer_confirmation_required', created_at timestamptz not null default now());
create table care_events (id text primary key, patient_id text not null references patients(id), occurred_at timestamptz not null, category text not null, author_label text not null, narrative text not null, created_at timestamptz not null default now());
create table handovers (id text primary key, patient_id text not null references patients(id), generated_at timestamptz not null, status handover_status not null default 'draft', summary text not null, source_event_ids text[] not null, created_at timestamptz not null default now());
create table handover_claims (id text primary key, handover_id text not null references handovers(id) on delete cascade, kind text not null check (kind in ('claim', 'unresolved')), text text not null, source_event_ids text[] not null check (cardinality(source_event_ids) > 0));
create table share_confirmations (id text primary key, handover_id text not null unique references handovers(id) on delete cascade, confirmed_by text not null, confirmed_at timestamptz not null, attestation text not null);
```

## Routes

| Route | Purpose |
| --- | --- |
| `/` | P0 clinician handover dashboard |
| `/handover/[handoverId]` | clinician handover detail |
| `/api/handovers/[handoverId]/share` | server-only sharing endpoint |

No browser bundle may contain service-role credentials. P0's demo works without remote services via the canned fallback.
