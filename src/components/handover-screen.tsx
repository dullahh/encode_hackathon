'use client';

import Image from 'next/image';
import { useMemo, useState } from 'react';

import { addReviewedEventToHandover, canCreateTemporaryShare, canPrepareIntake, CONTRIBUTOR_ROLE_LABELS, type IntakeDraft } from '@/features/intake/reviewed-event';
import { createBrowserVoiceAdapter } from '@/features/voice';
import { cannedDraftBundle } from '@/lib/demo-data';
import type { CareContributorRole, CareEvent, EventCategory, HandoverBundle, HandoverSection, ShareConfirmation, SourcedStatement } from '@/types/care';
import type { TemporaryShare } from '@/types/temporary-share';

const SECTION_LABELS: Record<HandoverSection, string> = {
  recorded_updates: 'Recorded updates', observations: 'Recorded observations', daily_living: 'Daily living', mobility: 'Mobility', appointments: 'Appointments',
};
const CATEGORIES: EventCategory[] = ['carer_note', 'support_visit', 'vitals', 'mobility', 'appointment'];
const ROLES: CareContributorRole[] = ['clinician', 'professional_caregiver', 'patient', 'family_informal_caregiver'];

function formatCategory(category: EventCategory): string { return category.replace('_', ' '); }
function reviewLabel(event: CareEvent): string { return event.reviewStatus === 'reviewed_observation' ? 'Reviewed observation' : 'Needs clarification'; }
function formatDateTime(occurredAt: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(new Date(occurredAt));
}
function syntheticIntakeOptions(events: readonly CareEvent[]) {
  const ordinal = events.filter((event) => event.id.startsWith('evt-intake-')).length + 1;
  return { id: `evt-intake-${String(ordinal).padStart(3, '0')}`, occurredAt: new Date(Date.parse('2026-07-22T17:10:00.000Z') + (ordinal - 1) * 60_000).toISOString() };
}

function StatusChip({ tone, children }: { tone: 'neutral' | 'success' | 'warning' | 'accent' | 'openai'; children: React.ReactNode }) {
  return <span className={`status-chip ${tone}`}>{children}</span>;
}

function SourceDetails({ sourceEventIds, events }: { sourceEventIds: readonly string[]; events: readonly CareEvent[] }) {
  const sourceEvents = sourceEventIds.map((id) => events.find((event) => event.id === id)).filter((event): event is CareEvent => Boolean(event));
  return <details className="source-details">
    <summary>View source details <span>{sourceEventIds.length}</span></summary>
    <div className="source-list">
      {sourceEvents.map((event) => <article className="source-record" key={event.id}>
        <div><strong>{event.authorLabel}</strong><span>{CONTRIBUTOR_ROLE_LABELS[event.contributorRole]}</span></div>
        <p>“{event.narrative}”</p>
        <small>{event.id} · {formatDateTime(event.occurredAt)} UTC · {event.provenance === 'voice' ? 'Voice, reviewed' : 'Typed'} · {reviewLabel(event)}</small>
      </article>)}
      {sourceEvents.length !== sourceEventIds.length && <p className="source-missing">One or more cited source records are unavailable.</p>}
    </div>
  </details>;
}

function StatementCard({ statement, events, unresolved = false }: { statement: SourcedStatement; events: readonly CareEvent[]; unresolved?: boolean }) {
  return <article className={`handover-card statement-card${unresolved ? ' unresolved-card' : ''}`}>
    <p>{statement.text}</p>
    <SourceDetails sourceEventIds={statement.sourceEventIds} events={events} />
  </article>;
}

function SectionHeading({ eyebrow, title, count, warning = false }: { eyebrow?: string; title: string; count?: number; warning?: boolean }) {
  return <div className={`section-heading${warning ? ' warning-heading' : ''}`}>
    <div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2>{title}</h2></div>
    {typeof count === 'number' && <span className="count-pill">{count}</span>}
  </div>;
}

export function HandoverScreen({ bundle, readOnly = false }: { bundle: HandoverBundle; readOnly?: boolean }) {
  const [currentPatient, setCurrentPatient] = useState(bundle.patient);
  const [currentEvents, setCurrentEvents] = useState(bundle.events);
  const [currentHandover, setCurrentHandover] = useState(bundle.handover);
  const [confirmed, setConfirmed] = useState(false);
  const [shared, setShared] = useState(bundle.handover.status === 'shared');
  const [shareDelivery, setShareDelivery] = useState<'remote' | 'canned_demo' | undefined>();
  const [temporaryShare, setTemporaryShare] = useState<TemporaryShare>();
  const [temporaryError, setTemporaryError] = useState('');
  const [typedText, setTypedText] = useState('');
  const [role, setRole] = useState<CareContributorRole>('family_informal_caregiver');
  const [category, setCategory] = useState<EventCategory>('carer_note');
  const [draft, setDraft] = useState<IntakeDraft>();
  const [intakeError, setIntakeError] = useState('');
  const [hasUndurableAdditions, setHasUndurableAdditions] = useState(false);
  const [isLocalDemoDraft, setIsLocalDemoDraft] = useState(false);

  const claimsBySection = useMemo(() => currentHandover.claims.reduce<Partial<Record<HandoverSection, SourcedStatement[]>>>((groups, claim) => {
    const section = claim.section ?? 'recorded_updates'; (groups[section] ??= []).push(claim); return groups;
  }, {}), [currentHandover.claims]);
  const intakeAvailable = canPrepareIntake(currentHandover);
  const qrEligible = canCreateTemporaryShare(currentHandover, hasUndurableAdditions);
  const isOpenAi = bundle.generation?.mode === 'openai' && !hasUndurableAdditions;
  const contributorCount = new Set(currentEvents.map((event) => event.authorLabel)).size;
  const reviewedCount = currentEvents.filter((event) => event.reviewStatus === 'reviewed_observation').length;
  const unresolvedCount = currentHandover.unresolved.length;

  const confirmation = (): ShareConfirmation => ({ handoverId: currentHandover.id, confirmedBy: currentPatient.primaryCarerName, confirmedAt: '2026-07-22T17:05:00.000Z', attestation: 'I confirm this handover may be shared.' });
  const startNewDraft = () => {
    setCurrentPatient(cannedDraftBundle.patient); setCurrentEvents(cannedDraftBundle.events); setCurrentHandover(cannedDraftBundle.handover);
    setConfirmed(false); setShared(false); setShareDelivery(undefined); setTemporaryShare(undefined); setTemporaryError(''); setDraft(undefined); setTypedText(''); setIntakeError(''); setHasUndurableAdditions(false); setIsLocalDemoDraft(true);
  };
  const createTypedDraft = () => {
    setIntakeError('');
    if (!typedText.trim()) { setIntakeError('Enter an observation before reviewing it.'); return; }
    setDraft({ text: typedText, category, contributorRole: role, provenance: 'typed' });
  };
  const startVoiceCapture = () => {
    const adapter = createBrowserVoiceAdapter();
    adapter.startCaptureFromUserGesture({ onUpdate: (update) => {
      if (update.transcript) { setIntakeError(''); setDraft({ text: update.transcript.text, category, contributorRole: role, provenance: 'voice' }); }
      else if (update.error) setIntakeError(update.error);
    } });
  };
  const addDraft = async () => {
    if (!draft) return;
    try {
      const result = addReviewedEventToHandover(currentPatient, currentHandover, currentEvents, draft, syntheticIntakeOptions(currentEvents));
      setCurrentEvents(result.events); setCurrentHandover(result.handover); setDraft(undefined); setTypedText(''); setIntakeError(''); setHasUndurableAdditions(true);
      if (isLocalDemoDraft) { setIntakeError('Added to this local synthetic draft. It remains non-durable and cannot be QR-shared with local additions.'); return; }
      const response = await fetch(`/api/handovers/${currentHandover.id}/events`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ event: result.event }) });
      if (response.ok) {
        const persisted = await response.json() as { bundle?: HandoverBundle };
        if (persisted.bundle) { setCurrentEvents(persisted.bundle.events); setCurrentHandover(persisted.bundle.handover); setHasUndurableAdditions(false); }
      } else setIntakeError('Added to this preparation session only. Apply the reviewed-event migration to save it durably before QR sharing.');
    } catch (error) { setIntakeError(error instanceof Error ? error.message : 'The reviewed observation could not be added.'); }
  };
  const share = async () => {
    if (!confirmed || hasUndurableAdditions) { if (hasUndurableAdditions) setTemporaryError('This preparation contains local reviewed additions. Apply the reviewed-event migration before sharing them through QR.'); return; }
    const response = await fetch(`/api/handovers/${currentHandover.id}/share`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirmation: confirmation() }) });
    if (!response.ok) return;
    const result = await response.json() as { delivery: 'remote' | 'canned_demo' };
    setShareDelivery(result.delivery); setShared(true); setCurrentHandover((handover) => ({ ...handover, status: 'shared' }));
  };
  const createTemporaryShare = async () => {
    if (!shared || hasUndurableAdditions) return;
    setTemporaryError('');
    const response = await fetch(`/api/handovers/${currentHandover.id}/temporary-share`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirmation: confirmation() }) });
    if (!response.ok) { setTemporaryError('Temporary sharing is unavailable. Confirm that the QR migration has been applied for remote use.'); return; }
    setTemporaryShare(await response.json() as TemporaryShare);
  };
  const revokeTemporaryShare = async () => {
    if (!temporaryShare) return;
    const response = await fetch(`/api/temporary-shares/${temporaryShare.id}/revoke`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ handoverId: currentHandover.id, confirmation: confirmation() }) });
    if (response.ok) setTemporaryShare(undefined); else setTemporaryError('This temporary share is unavailable.');
  };

  if (readOnly) return <main className="recipient-shell">
    <div className="recipient-banner"><strong>Read-only temporary handover</strong><span>This shared summary cannot be edited here. Opening it does not sign you in or verify your role.</span></div>
    <header className="recipient-header"><span className="eyebrow">CareRelay handover</span><StatusChip tone="neutral">Synthetic demo data</StatusChip><h1>{currentPatient.displayName}</h1><p>Preferred name {currentPatient.preferredName} · Prepared with {contributorCount} contributor{contributorCount === 1 ? '' : 's'}.</p></header>
    <section className="recipient-notice"><strong>Read first:</strong> unresolved information is reported as supplied and is not a confirmed clinical fact.</section>
    <section className="recipient-section"><SectionHeading title="Unresolved information" count={unresolvedCount} warning /><div className="card-stack">{currentHandover.unresolved.map((item) => <StatementCard key={item.id} statement={item} events={currentEvents} unresolved />)}</div></section>
    {Object.entries(claimsBySection).map(([section, claims]) => <section className="recipient-section" key={section}><SectionHeading title={SECTION_LABELS[section as HandoverSection]} count={claims?.length} /><div className="card-stack">{claims?.map((claim) => <StatementCard key={claim.id} statement={claim} events={currentEvents} />)}</div></section>)}
    <footer className="handover-footer">CareRelay · Synthetic demonstration only. This read-only handover reports source-linked information and does not provide diagnosis, triage, or treatment recommendations.</footer>
  </main>;

  return <main className="workspace-shell">
    <header className="workspace-header"><div className="workspace-header-inner"><div><span className="brand-line">CareRelay <span>Care handover</span></span><h1>{currentPatient.displayName}</h1><p>Preferred name {currentPatient.preferredName} · Primary carer {currentPatient.primaryCarerName} ({currentPatient.relationshipToCarer})</p></div><div className="header-status"><StatusChip tone="neutral">Synthetic demo data</StatusChip><StatusChip tone={shared ? 'success' : 'accent'}>{shared ? 'Confirmed for sharing' : intakeAvailable ? 'Draft · in preparation' : 'Confirmed handover'}</StatusChip><StatusChip tone={isOpenAi ? 'openai' : 'warning'}>{isOpenAi ? 'OpenAI-structured, server-validated' : 'Deterministic evidence-led fallback'}</StatusChip></div></div></header>
    <div className="workspace-content"><section className="safety-notice">This screen reports recorded, human-reviewed information only. It does not provide diagnosis, triage, or treatment recommendations.</section>
      <section className="summary-stats" aria-label="Handover summary"><div><strong>{reviewedCount}</strong><span>Reviewed observations</span></div><div className="warning-stat"><strong>{unresolvedCount}</strong><span>Open questions</span></div><div><strong>{contributorCount}</strong><span>Contributors</span></div></section>
      <div className="workspace-grid"><section className="handover-main"><section><SectionHeading eyebrow="Current reviewed handover" title="Handover overview" /><StatementCard statement={currentHandover.summary} events={currentEvents} /></section>
        <section className="unresolved-section"><SectionHeading title="Unresolved information" count={unresolvedCount} warning /><p>These items need clarification or are incomplete. They are not inferred.</p><div className="card-stack">{currentHandover.unresolved.map((item) => <StatementCard key={item.id} statement={item} events={currentEvents} unresolved />)}</div></section>
        {Object.entries(claimsBySection).map(([section, claims]) => <section key={section}><SectionHeading title={SECTION_LABELS[section as HandoverSection]} count={claims?.length} /><div className="card-stack">{claims?.map((claim) => <StatementCard key={claim.id} statement={claim} events={currentEvents} />)}</div></section>)}
        {bundle.generation?.warnings.map((warning) => <p className="generation-warning" key={warning}>{warning}</p>)}
      </section>
      <aside className="workspace-rail">{!isLocalDemoDraft && <section className="handover-card start-draft-card"><h2>Start a new draft</h2><p>Maya’s confirmed handover is immutable. Start a separate synthetic draft to add reviewed observations.</p><button className="button secondary-button" onClick={startNewDraft}>Start new draft handover</button></section>}
        <section className="handover-card composer-card"><SectionHeading title="Add a reviewed observation" /><p>Any care contributor can prepare this handover. Review means the text accurately represents their statement; it is not independent clinical verification.</p>{!intakeAvailable && <p className="warning-message">This handover is confirmed and immutable. Start a new draft to add observations.</p>}
          <label>Relationship or role<select disabled={!intakeAvailable} value={role} onChange={(event) => setRole(event.target.value as CareContributorRole)}>{ROLES.map((item) => <option key={item} value={item}>{CONTRIBUTOR_ROLE_LABELS[item]}</option>)}</select></label><label>Category<select disabled={!intakeAvailable} value={category} onChange={(event) => setCategory(event.target.value as EventCategory)}>{CATEGORIES.map((item) => <option key={item} value={item}>{formatCategory(item)}</option>)}</select></label><label>Record what was observed or reported<textarea disabled={!intakeAvailable} value={typedText} onChange={(event) => setTypedText(event.target.value)} placeholder="Record what was observed or reported." /></label><div className="button-row"><button className="button" disabled={!intakeAvailable} onClick={createTypedDraft}>Review typed observation</button><button className="button secondary-button" disabled={!intakeAvailable} onClick={startVoiceCapture}>Capture by voice, then review</button></div><p className="helper-text">Voice capture needs a supported, secure browser microphone. The transcript must be reviewed before it affects the handover.</p>
          {draft && <section className="draft-review"><SectionHeading title="Review draft" /><p>Origin: {draft.provenance === 'voice' ? 'voice transcript' : 'typed observation'}. Nothing changes until you add it.</p><label>Editable statement<textarea value={draft.text} onChange={(event) => setDraft({ ...draft, text: event.target.value })} /></label><label>Category<select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value as EventCategory })}>{CATEGORIES.map((item) => <option key={item} value={item}>{formatCategory(item)}</option>)}</select></label><fieldset><legend>Review outcome</legend><label className={`review-choice${draft.reviewStatus === 'reviewed_observation' ? ' selected reviewed' : ''}`}><input type="radio" checked={draft.reviewStatus === 'reviewed_observation'} onChange={() => setDraft({ ...draft, reviewStatus: 'reviewed_observation' })} /> Reviewed observation</label><label className={`review-choice${draft.reviewStatus === 'needs_clarification' ? ' selected clarification' : ''}`}><input type="radio" checked={draft.reviewStatus === 'needs_clarification'} onChange={() => setDraft({ ...draft, reviewStatus: 'needs_clarification' })} /> Needs clarification</label></fieldset><div className="button-row"><button className="button" disabled={!draft.reviewStatus || !intakeAvailable} onClick={addDraft}>Add to handover</button><button className="button secondary-button" onClick={() => { setDraft(undefined); setIntakeError(''); }}>Discard draft</button></div></section>}
          {intakeError && <p className="error-message">{intakeError}</p>}
        </section>
        <section className="handover-card share-card"><SectionHeading title="Confirm & share" /><p>Explicit confirmation is required before a temporary, read-only handover can be shared.</p><label className="confirmation-check"><input disabled={!intakeAvailable && !shared} checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} type="checkbox" /><span>I confirm this reviewed handover may be shared as a temporary, read-only summary.</span></label><button className="button" disabled={!confirmed || shared || hasUndurableAdditions || !intakeAvailable} onClick={share}>{shared ? 'Handover confirmed' : 'Confirm handover for sharing'}</button>{hasUndurableAdditions && <p className="warning-message">Reviewed additions are visible in this local preparation session. They are not durably shareable until the reviewed-event migration is manually applied.</p>}{shared && <p className="success-message">{shareDelivery === 'remote' ? 'Saved and confirmed through Supabase.' : shareDelivery === 'canned_demo' ? 'Confirmed in the canned demo fallback; no remote patient data was used.' : 'This handover is already confirmed.'}</p>}<div className="subsection-divider" /><h3>Temporary QR share</h3><p>The QR contains an opaque, time-limited token — not patient data or source-event IDs.</p><button className="button" disabled={!shared || Boolean(temporaryShare) || !qrEligible} onClick={createTemporaryShare}>Create temporary QR share</button>{temporaryError && <p className="error-message">{temporaryError}</p>}{temporaryShare && <div className="qr-share"><Image src={temporaryShare.qrCodeDataUrl} alt="QR code for the temporary handover" width={320} height={320} unoptimized /><StatusChip tone="warning">Expires {formatDateTime(temporaryShare.expiresAt)} UTC</StatusChip><a className="share-url" href={temporaryShare.accessUrl}>Open recipient view</a><p className={temporaryShare.delivery === 'remote' ? 'success-message' : 'warning-message'}>{temporaryShare.delivery === 'remote' ? 'Persisted remote temporary share.' : 'Non-durable local-demo temporary share; it is not suitable for deployment.'}</p><button className="button secondary-button" onClick={revokeTemporaryShare}>Revoke temporary share</button></div>}</section>
      </aside></div>
      <section className="timeline-section"><SectionHeading title="Source event timeline" /><div className="timeline-card">{currentEvents.map((event) => <article id={event.id} className="timeline-event" key={event.id}><time>{formatDateTime(event.occurredAt)} UTC</time><div><strong>{event.authorLabel}</strong><span>{CONTRIBUTOR_ROLE_LABELS[event.contributorRole]}</span><p>{event.narrative}</p><small>{event.id} · {event.provenance === 'voice' ? 'Voice, reviewed' : 'Typed'} · {reviewLabel(event)}</small></div></article>)}</div></section>
      <footer className="handover-footer">CareRelay · Synthetic demonstration only. No real patient data is shown.</footer>
    </div>
  </main>;
}
