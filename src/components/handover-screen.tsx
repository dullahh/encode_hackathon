'use client';

import { useState } from 'react';
import Image from 'next/image';

import { createBrowserVoiceAdapter } from '@/features/voice';
import type { HandoverBundle, ShareConfirmation, SourcedStatement } from '@/types/care';
import type { TemporaryShare } from '@/types/temporary-share';

function SourceLinks({ sourceEventIds }: Pick<SourcedStatement, 'sourceEventIds'>) {
  return <p className="sources">Sources: {sourceEventIds.map((id) => <a href={`#${id}`} key={id}>{id}</a>)}</p>;
}

function StatementCard({ statement }: { statement: SourcedStatement }) {
  return <article className="statement"><p>{statement.text}</p><SourceLinks sourceEventIds={statement.sourceEventIds} /></article>;
}

export function HandoverScreen({ bundle, readOnly = false }: { bundle: HandoverBundle; readOnly?: boolean }) {
  const { patient, handover, events } = bundle;
  const [confirmed, setConfirmed] = useState(false);
  const [shared, setShared] = useState(handover.status === 'shared');
  const [shareDelivery, setShareDelivery] = useState<'remote' | 'canned_demo' | undefined>();
  const [temporaryShare, setTemporaryShare] = useState<TemporaryShare>();
  const [temporaryError, setTemporaryError] = useState('');
  const [voiceState, setVoiceState] = useState('');

  const confirmation = (): ShareConfirmation => ({
    handoverId: handover.id,
    confirmedBy: patient.primaryCarerName,
    confirmedAt: '2026-07-22T17:05:00.000Z',
    attestation: 'I confirm this handover may be shared.',
  });

  const share = async () => {
    if (!confirmed) return;
    const response = await fetch(`/api/handovers/${handover.id}/share`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirmation: confirmation() }) });
    if (!response.ok) return;
    const result = await response.json() as { delivery: 'remote' | 'canned_demo' };
    setShareDelivery(result.delivery);
    setShared(true);
  };

  const createTemporaryShare = async () => {
    if (!shared) return;
    setTemporaryError('');
    const response = await fetch(`/api/handovers/${handover.id}/temporary-share`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirmation: confirmation() }) });
    if (!response.ok) {
      setTemporaryError('Temporary sharing is unavailable. Confirm that the QR migration has been applied for remote use.');
      return;
    }
    setTemporaryShare(await response.json() as TemporaryShare);
  };

  const revokeTemporaryShare = async () => {
    if (!temporaryShare) return;
    const response = await fetch(`/api/temporary-shares/${temporaryShare.id}/revoke`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ handoverId: handover.id, confirmation: confirmation() }) });
    if (response.ok) setTemporaryShare(undefined);
    else setTemporaryError('This temporary share is unavailable.');
  };

  const startVoiceCapture = () => {
    const adapter = createBrowserVoiceAdapter();
    adapter.startCaptureFromUserGesture({ onUpdate: (update) => {
      if (update.transcript) setVoiceState(`Unverified local transcript: “${update.transcript.text}”`);
      else if (update.error) setVoiceState(update.error);
      else setVoiceState(update.state === 'listening' ? 'Listening locally…' : 'Voice capture stopped.');
    } });
  };

  return <main className="shell">
    <header className="topbar"><div><span className="eyebrow">CareRelay · P0 clinician handover</span><h1>{patient.displayName}</h1><p>Preferred name: {patient.preferredName} · Carer: {patient.primaryCarerName} ({patient.relationshipToCarer})</p></div><span className="demo-badge">Synthetic demo data</span></header>
    <section className="notice"><strong>Evidence-led handover.</strong> This screen reports recorded information only. It does not provide diagnosis, triage, or treatment recommendations.</section>
    <div className="grid">
      <section className="panel primary"><span className="eyebrow">Generated 22 Jul 2026, 17:00 UTC</span><h2>Handover overview</h2><StatementCard statement={handover.summary} />
        <h2>Recorded updates</h2><div className="stack">{handover.claims.map((claim) => <StatementCard key={claim.id} statement={claim} />)}</div>
        <h2>Unresolved</h2><p className="helper">These items are uncertain or not recorded; they are not inferred.</p><div className="stack unresolved">{handover.unresolved.map((item) => <StatementCard key={item.id} statement={item} />)}</div>
      </section>
      {readOnly ? <aside className="panel"><h2>Read-only temporary handover</h2><p>This view was opened through a time-limited link. It cannot create, change, or share care records.</p></aside> : <aside className="panel"><h2>Share handover</h2><p>Carer confirmation is required before sharing.</p><label className="checkbox"><input checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} type="checkbox" /> <span>I confirm that {patient.primaryCarerName} has approved sharing this handover.</span></label><button disabled={!confirmed || shared} onClick={share}>{shared ? 'Handover shared' : 'Share handover'}</button>{shared && <p className="success">{shareDelivery === 'remote' ? 'Saved and shared through Supabase.' : shareDelivery === 'canned_demo' ? 'Recorded in the canned demo fallback; no remote patient data was used.' : 'This handover is already marked shared.'}</p>}<hr /><h2>Temporary QR share</h2><p className="helper">A QR code is available only after carer confirmation. It contains an opaque, time-limited token—not patient data or source-event IDs.</p><button disabled={!shared || Boolean(temporaryShare)} onClick={createTemporaryShare}>Create temporary QR share</button>{temporaryError && <p className="error-state">{temporaryError}</p>}{temporaryShare && <div className="qr-share"><Image src={temporaryShare.qrCodeDataUrl} alt="QR code for the temporary clinician handover" width={320} height={320} unoptimized /><p><strong>Expires:</strong> {new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(temporaryShare.expiresAt))}</p><a className="share-url" href={temporaryShare.accessUrl}>{temporaryShare.accessUrl}</a><p className={temporaryShare.delivery === 'remote' ? 'success' : 'warning'}>{temporaryShare.delivery === 'remote' ? 'Persisted remote temporary share.' : 'Non-durable local-demo temporary share; it is not suitable for deployment.'}</p><button className="secondary" onClick={revokeTemporaryShare}>Revoke temporary share</button></div>}<hr /><h2>Optional voice note</h2><p className="helper">Local speech recognition only. A transcript is unresolved until a person reviews it; it cannot create a handover claim.</p><button className="secondary" onClick={startVoiceCapture}>Capture voice note</button>{voiceState && <p className="voice-state">{voiceState}</p>}</aside>}
    </div>
    <section className="panel timeline"><h2>Source event timeline</h2>{events.map((event) => <article id={event.id} className="event" key={event.id}><time>{new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(new Date(event.occurredAt))} UTC</time><div><strong>{event.authorLabel}</strong><p>{event.narrative}</p><span>{event.id}</span></div></article>)}</section>
  </main>;
}
