'use client';

import Image from 'next/image';
import { useState } from 'react';

import { addReviewedEventToHandover, canCreateTemporaryShare, canPrepareIntake, CONTRIBUTOR_ROLE_LABELS, type IntakeDraft } from '@/features/intake/reviewed-event';
import { createBrowserVoiceAdapter } from '@/features/voice';
import { cannedDraftBundle } from '@/lib/demo-data';
import type { CareContributorRole, CareEvent, EventCategory, HandoverBundle, HandoverSection, ShareConfirmation, SourcedStatement } from '@/types/care';
import type { TemporaryShare } from '@/types/temporary-share';

const SECTION_LABELS: Record<HandoverSection, string> = { recorded_updates: 'Recorded updates', observations: 'Recorded observations', daily_living: 'Daily living', mobility: 'Mobility', appointments: 'Appointments' };
const CATEGORIES: EventCategory[] = ['carer_note', 'support_visit', 'vitals', 'mobility', 'appointment'];
const ROLES: CareContributorRole[] = ['clinician', 'professional_caregiver', 'patient', 'family_informal_caregiver'];

function SourceLinks({ sourceEventIds }: Pick<SourcedStatement, 'sourceEventIds'>) {
  return <p className="sources">Sources: {sourceEventIds.map((id) => <a href={`#${id}`} key={id}>{id}</a>)}</p>;
}

function StatementCard({ statement }: { statement: SourcedStatement }) {
  return <article className="statement"><p>{statement.text}</p><SourceLinks sourceEventIds={statement.sourceEventIds} /></article>;
}

function formatCategory(category: EventCategory): string { return category.replace('_', ' '); }

function syntheticIntakeOptions(events: readonly CareEvent[]) {
  const ordinal = events.filter((event) => event.id.startsWith('evt-intake-')).length + 1;
  return { id: `evt-intake-${String(ordinal).padStart(3, '0')}`, occurredAt: new Date(Date.parse('2026-07-22T17:10:00.000Z') + (ordinal - 1) * 60_000).toISOString() };
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
  const claimsBySection = currentHandover.claims.reduce<Partial<Record<HandoverSection, SourcedStatement[]>>>((groups, claim) => { const section = claim.section ?? 'recorded_updates'; (groups[section] ??= []).push(claim); return groups; }, {});

  const confirmation = (): ShareConfirmation => ({ handoverId: currentHandover.id, confirmedBy: currentPatient.primaryCarerName, confirmedAt: '2026-07-22T17:05:00.000Z', attestation: 'I confirm this handover may be shared.' });
  const startNewDraft = () => {
    setCurrentPatient(cannedDraftBundle.patient); setCurrentEvents(cannedDraftBundle.events); setCurrentHandover(cannedDraftBundle.handover);
    setConfirmed(false); setShared(false); setShareDelivery(undefined); setTemporaryShare(undefined); setTemporaryError(''); setDraft(undefined); setTypedText(''); setIntakeError(''); setHasUndurableAdditions(false); setIsLocalDemoDraft(true);
  };
  const createTypedDraft = () => { setIntakeError(''); if (!typedText.trim()) { setIntakeError('Enter an observation before reviewing it.'); return; } setDraft({ text: typedText, category, contributorRole: role, provenance: 'typed' }); };
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
  const isOpenAi = bundle.generation?.mode === 'openai' && !hasUndurableAdditions;
  const qrEligible = canCreateTemporaryShare(currentHandover, hasUndurableAdditions);
  const intakeAvailable = canPrepareIntake(currentHandover);

  return <main className="shell">
    <header className="topbar"><div><span className="eyebrow">CareRelay · P0 care handover</span><h1>{currentPatient.displayName}</h1><p>Preferred name: {currentPatient.preferredName} · Carer: {currentPatient.primaryCarerName} ({currentPatient.relationshipToCarer})</p></div><div className="badges"><span className="demo-badge">Synthetic demo data</span><span className={isOpenAi ? 'mode-badge openai' : 'mode-badge fallback'}>{isOpenAi ? 'OpenAI-structured, server-validated' : 'Deterministic evidence-led fallback'}</span></div></header>
    <section className="notice"><strong>Evidence-led handover.</strong> This screen reports recorded information only. It does not provide diagnosis, triage, or treatment recommendations.</section>
    <div className="grid">
      <section className="panel primary"><span className="eyebrow">Current reviewed handover</span><h2>Handover overview</h2><StatementCard statement={currentHandover.summary} />
        <section className="unresolved-callout"><h2>Unresolved information</h2><p className="helper">These items need clarification or are incomplete. They are not inferred.</p><div className="stack unresolved">{currentHandover.unresolved.map((item) => <StatementCard key={item.id} statement={item} />)}</div></section>
        {Object.entries(claimsBySection).map(([section, claims]) => <section key={section}><h2>{SECTION_LABELS[section as HandoverSection]}</h2><div className="stack">{claims?.map((claim) => <StatementCard key={claim.id} statement={claim} />)}</div></section>)}
        {bundle.generation?.warnings.map((warning) => <p className="generation-warning" key={warning}>{warning}</p>)}
      </section>
      {readOnly ? <aside className="panel"><h2>Read-only temporary handover</h2><p>This view was opened through a time-limited link. It cannot create, change, or share care records.</p></aside> : <aside className="panel">
        {!isLocalDemoDraft && <><h2>Start a new draft</h2><p className="helper">Maya’s confirmed handover is immutable. Start a separate synthetic draft to add reviewed observations.</p><button className="secondary" onClick={startNewDraft}>Start new draft handover</button><hr /></>}
        <h2>Add a reviewed observation</h2><p className="helper">Any care contributor can prepare this handover. Review means the text accurately represents your statement; it is not independent clinical verification.</p>
        {!intakeAvailable && <p className="warning">This handover is confirmed and immutable. Start a new draft to add observations.</p>}
        <label>Relationship or role<select disabled={!intakeAvailable} value={role} onChange={(event) => setRole(event.target.value as CareContributorRole)}>{ROLES.map((item) => <option key={item} value={item}>{CONTRIBUTOR_ROLE_LABELS[item]}</option>)}</select></label><label>Category<select disabled={!intakeAvailable} value={category} onChange={(event) => setCategory(event.target.value as EventCategory)}>{CATEGORIES.map((item) => <option key={item} value={item}>{formatCategory(item)}</option>)}</select></label><label>Typed observation<textarea disabled={!intakeAvailable} value={typedText} onChange={(event) => setTypedText(event.target.value)} placeholder="Record what was observed or reported." /></label><button className="secondary" disabled={!intakeAvailable} onClick={createTypedDraft}>Review typed observation</button><p className="helper">Voice capture needs a supported, secure browser microphone. If it is unavailable, use typed intake and review it before adding.</p><button className="secondary" disabled={!intakeAvailable} onClick={startVoiceCapture}>Capture voice observation</button>{draft && <section className="intake-review"><h2>Review draft</h2><p className="helper">Origin: {draft.provenance === 'voice' ? 'voice transcript' : 'typed observation'}. Nothing changes until you add it.</p><label>Editable statement<textarea value={draft.text} onChange={(event) => setDraft({ ...draft, text: event.target.value })} /></label><label>Category<select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value as EventCategory })}>{CATEGORIES.map((item) => <option key={item} value={item}>{formatCategory(item)}</option>)}</select></label><fieldset><legend>Review outcome</legend><label className="radio"><input type="radio" checked={draft.reviewStatus === 'reviewed_observation'} onChange={() => setDraft({ ...draft, reviewStatus: 'reviewed_observation' })} /> Reviewed observation</label><label className="radio"><input type="radio" checked={draft.reviewStatus === 'needs_clarification'} onChange={() => setDraft({ ...draft, reviewStatus: 'needs_clarification' })} /> Needs clarification</label></fieldset><button disabled={!draft.reviewStatus || !intakeAvailable} onClick={addDraft}>Add to handover</button><button className="secondary" onClick={() => { setDraft(undefined); setIntakeError(''); }}>Discard draft</button></section>}{intakeError && <p className="error-state">{intakeError}</p>}<hr /><h2>Confirm handover for sharing</h2><p>Explicit confirmation is required before temporary QR sharing.</p><label className="checkbox"><input disabled={!intakeAvailable && !shared} checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} type="checkbox" /> <span>I confirm this reviewed handover may be shared.</span></label><button disabled={!confirmed || shared || hasUndurableAdditions || !intakeAvailable} onClick={share}>{shared ? 'Handover confirmed' : 'Confirm handover for sharing'}</button>{hasUndurableAdditions && <p className="warning">Reviewed additions are visible in this local preparation session. They are not durably shareable until the reviewed-event migration is manually applied.</p>}{shared && <p className="success">{shareDelivery === 'remote' ? 'Saved and confirmed through Supabase.' : shareDelivery === 'canned_demo' ? 'Confirmed in the canned demo fallback; no remote patient data was used.' : 'This handover is already confirmed.'}</p>}<hr /><h2>Temporary QR share</h2><p className="helper">Available only after explicit handover confirmation. The QR contains an opaque, time-limited token—not patient data or source-event IDs.</p><button disabled={!shared || Boolean(temporaryShare) || !qrEligible} onClick={createTemporaryShare}>Create temporary QR share</button>{temporaryError && <p className="error-state">{temporaryError}</p>}{temporaryShare && <div className="qr-share"><Image src={temporaryShare.qrCodeDataUrl} alt="QR code for the temporary handover" width={320} height={320} unoptimized /><p><strong>Expires:</strong> {new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(temporaryShare.expiresAt))}</p><a className="share-url" href={temporaryShare.accessUrl}>{temporaryShare.accessUrl}</a><p className={temporaryShare.delivery === 'remote' ? 'success' : 'warning'}>{temporaryShare.delivery === 'remote' ? 'Persisted remote temporary share.' : 'Non-durable local-demo temporary share; it is not suitable for deployment.'}</p><button className="secondary" onClick={revokeTemporaryShare}>Revoke temporary share</button></div>}</aside>}
    </div>
    <section className="panel timeline"><h2>Source event timeline</h2>{currentEvents.map((event) => <article id={event.id} className="event" key={event.id}><time>{new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(new Date(event.occurredAt))} UTC</time><div><strong>{event.authorLabel}</strong><p>{event.narrative}</p><span>{event.id} · {event.provenance} · {event.reviewStatus === 'reviewed_observation' ? 'Reviewed observation' : 'Needs clarification'}</span></div></article>)}</section>
  </main>;
}
