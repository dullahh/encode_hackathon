-- Additive CareRelay P0 QR-share persistence. Review and apply manually to the
-- intended Supabase project; this application never alters remote schema itself.
create table temporary_handover_shares (
  id uuid primary key,
  handover_id text not null references handovers(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  expired_audited_at timestamptz,
  created_at timestamptz not null default now()
);

create table temporary_share_audit_events (
  id uuid primary key,
  share_id uuid not null references temporary_handover_shares(id) on delete cascade,
  event_type text not null check (event_type in ('created', 'opened', 'expired', 'revoked')),
  occurred_at timestamptz not null default now()
);

create index temporary_handover_shares_token_hash_idx on temporary_handover_shares(token_hash);
create index temporary_share_audit_events_share_id_idx on temporary_share_audit_events(share_id);

alter table temporary_handover_shares enable row level security;
alter table temporary_share_audit_events enable row level security;
