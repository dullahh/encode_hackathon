-- Manual review required. Do not apply automatically.
-- Adds immutable clinician resolution evidence and immutable handover lineage.

alter table handovers
  add column if not exists version integer not null default 1 check (version > 0),
  add column if not exists derived_from_handover_id text references handovers(id);

create table if not exists clinical_resolution_events (
  id text primary key,
  patient_id text not null references patients(id),
  original_event_id text not null references care_events(id),
  action text not null check (action in ('corroborated', 'clarified', 'contradicted', 'kept_open', 'entered_in_error')),
  clinician_id text not null,
  clinician_display_name text not null,
  clinician_organisation text,
  clinician_role text,
  occurred_at timestamptz not null,
  clinical_explanation text not null check (length(trim(clinical_explanation)) > 0),
  supporting_evidence text not null check (length(trim(supporting_evidence)) > 0),
  clinical_condition_status text not null check (clinical_condition_status in ('active', 'ongoing', 'resolved', 'unknown')),
  created_at timestamptz not null default now()
);

create index if not exists clinical_resolution_events_original_event_idx
  on clinical_resolution_events (original_event_id, occurred_at, id);

-- The project has RLS enabled with no public policies. Preserve that posture.
alter table clinical_resolution_events enable row level security;
