-- CareRelay P0: fictional synthetic-demo persistence schema only.
create type consent_status as enum ('carer_confirmation_required', 'confirmed');
create type handover_status as enum ('draft', 'ready_to_share', 'shared');

create table patients (
  id text primary key,
  display_name text not null,
  date_of_birth date not null,
  primary_carer_name text not null,
  consent_status consent_status not null default 'carer_confirmation_required',
  created_at timestamptz not null default now()
);

create table care_events (
  id text primary key,
  patient_id text not null references patients(id),
  occurred_at timestamptz not null,
  category text not null,
  author_label text not null,
  narrative text not null,
  created_at timestamptz not null default now()
);

create table handovers (
  id text primary key,
  patient_id text not null references patients(id),
  generated_at timestamptz not null,
  status handover_status not null default 'draft',
  summary text not null,
  source_event_ids text[] not null,
  created_at timestamptz not null default now()
);

create table handover_claims (
  id text primary key,
  handover_id text not null references handovers(id) on delete cascade,
  kind text not null check (kind in ('claim', 'unresolved')),
  text text not null,
  source_event_ids text[] not null check (cardinality(source_event_ids) > 0)
);

create table share_confirmations (
  id text primary key,
  handover_id text not null unique references handovers(id) on delete cascade,
  confirmed_by text not null,
  confirmed_at timestamptz not null,
  attestation text not null
);
