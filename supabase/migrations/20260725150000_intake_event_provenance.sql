-- Additive CareRelay intake provenance. Review and apply manually to the intended
-- Supabase project; the application never applies this migration automatically.
alter table care_events
  add column contributor_role text check (contributor_role in ('clinician', 'professional_caregiver', 'patient', 'family_informal_caregiver')),
  add column provenance text check (provenance in ('typed', 'voice')),
  add column review_status text check (review_status in ('reviewed_observation', 'needs_clarification'));

-- The existing P0 rows are synthetic fixtures. Preserve their history while making
-- provenance explicit before requiring it for all future source events.
update care_events
set contributor_role = case when author_label ilike 'Daniel%' then 'family_informal_caregiver' else 'professional_caregiver' end,
    provenance = 'typed',
    review_status = 'reviewed_observation'
where contributor_role is null or provenance is null or review_status is null;

alter table care_events
  alter column contributor_role set not null,
  alter column provenance set not null,
  alter column review_status set not null;
