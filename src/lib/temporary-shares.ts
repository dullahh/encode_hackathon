import 'server-only';

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import QRCode from 'qrcode';

import { cannedDemoBundle } from '@/lib/demo-data';
import { createHandoverRepository } from '@/lib/supabase/handover-repository';
import { createSupabaseServerClient, type SupabaseServerClient } from '@/lib/supabase/server-client';
import type { HandoverBundle, ShareConfirmation } from '@/types/care';
import type { TemporaryShare, TemporaryShareState } from '@/types/temporary-share';

const SHARE_TTL_MS = 30 * 60 * 1000;

type ShareEventType = 'created' | 'opened' | 'expired' | 'revoked';

type RemoteShareRow = {
  id: string;
  handover_id: string;
  expires_at: string;
  revoked_at: string | null;
  expired_audited_at: string | null;
};

type LocalShareRow = RemoteShareRow & { tokenHash: string; audit: ShareEventType[] };

const localDemoShares = new Map<string, LocalShareRow>();

export class TemporaryShareError extends Error {
  constructor(message: string, readonly status: 400 | 403 | 404 | 503 = 400) {
    super(message);
    this.name = 'TemporaryShareError';
  }
}

export interface TemporaryShareResolution {
  state: TemporaryShareState;
  bundle?: HandoverBundle;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function newToken(): string {
  return randomBytes(32).toString('base64url');
}

function expiration(now = Date.now()): string {
  return new Date(now + SHARE_TTL_MS).toISOString();
}

async function qrCode(accessUrl: string): Promise<string> {
  return QRCode.toDataURL(accessUrl, { errorCorrectionLevel: 'M', margin: 1, width: 320 });
}

async function assertConfirmedHandover(client: SupabaseServerClient, handoverId: string): Promise<void> {
  const [handovers, confirmations] = await Promise.all([
    client.request<Array<{ status: string }>>(`handovers?id=eq.${encodeURIComponent(handoverId)}&select=status`),
    client.request<Array<{ handover_id: string }>>(`share_confirmations?handover_id=eq.${encodeURIComponent(handoverId)}&select=handover_id`),
  ]);

  if (handovers.length !== 1 || handovers[0].status !== 'shared' || confirmations.length !== 1) {
    throw new TemporaryShareError('Only a carer-confirmed shared handover can create or revoke a temporary share.', 403);
  }
}

async function audit(client: SupabaseServerClient, shareId: string, eventType: ShareEventType): Promise<void> {
  await client.request('temporary_share_audit_events', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ id: randomUUID(), share_id: shareId, event_type: eventType }),
  });
}

async function createRemoteShare(client: SupabaseServerClient, handoverId: string, accessOrigin: string): Promise<TemporaryShare> {
  await assertConfirmedHandover(client, handoverId);
  const token = newToken();
  const id = randomUUID();
  const expiresAt = expiration();
  const accessUrl = new URL(`/share/${token}`, accessOrigin).toString();

  try {
    await client.request('temporary_handover_shares', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ id, handover_id: handoverId, token_hash: hashToken(token), expires_at: expiresAt }),
    });
    await audit(client, id, 'created');
  } catch {
    // Avoid presenting a share whose creation could not be fully audited.
    await client.request(`temporary_handover_shares?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => undefined);
    throw new TemporaryShareError('Temporary sharing is unavailable until the QR migration is applied to Supabase.', 503);
  }

  return { id, accessUrl, expiresAt, qrCodeDataUrl: await qrCode(accessUrl), delivery: 'remote' };
}

async function createLocalDemoShare(handoverId: string, accessOrigin: string): Promise<TemporaryShare> {
  if (handoverId !== cannedDemoBundle.handover.id || cannedDemoBundle.handover.status !== 'ready_to_share') {
    throw new TemporaryShareError('The local demo can only share the fixed synthetic handover after confirmation.', 403);
  }

  const token = newToken();
  const id = randomUUID();
  const expiresAt = expiration();
  const accessUrl = new URL(`/share/${token}`, accessOrigin).toString();
  localDemoShares.set(hashToken(token), { id, handover_id: handoverId, expires_at: expiresAt, revoked_at: null, expired_audited_at: null, tokenHash: hashToken(token), audit: ['created'] });
  return { id, accessUrl, expiresAt, qrCodeDataUrl: await qrCode(accessUrl), delivery: 'local_demo' };
}

/** Server-only creation. The local branch is intentionally non-durable demo behaviour. */
export async function createTemporaryShare(handoverId: string, accessOrigin: string, confirmation: ShareConfirmation | undefined): Promise<TemporaryShare> {
  if (!confirmation || confirmation.handoverId !== handoverId || !confirmation.confirmedBy.trim() || !confirmation.confirmedAt || !confirmation.attestation.trim()) {
    throw new TemporaryShareError('Carer confirmation is required before creating a temporary share.', 403);
  }
  const client = createSupabaseServerClient();
  return client ? createRemoteShare(client, handoverId, accessOrigin) : createLocalDemoShare(handoverId, accessOrigin);
}

async function resolveRemoteShare(client: SupabaseServerClient, token: string): Promise<TemporaryShareResolution> {
  const rows = await client.request<RemoteShareRow[]>(`temporary_handover_shares?token_hash=eq.${hashToken(token)}&select=id,handover_id,expires_at,revoked_at,expired_audited_at`);
  const share = rows[0];
  if (!share) return { state: 'invalid' };
  if (share.revoked_at) return { state: 'revoked' };
  if (new Date(share.expires_at).getTime() <= Date.now()) {
    if (!share.expired_audited_at) {
      const now = new Date().toISOString();
      await client.request(`temporary_handover_shares?id=eq.${encodeURIComponent(share.id)}&expired_audited_at=is.null`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ expired_audited_at: now }) });
      await audit(client, share.id, 'expired');
    }
    return { state: 'expired' };
  }

  const bundle = await createHandoverRepository()?.getBundle(share.handover_id);
  if (!bundle || bundle.handover.id !== share.handover_id) return { state: 'invalid' };
  await audit(client, share.id, 'opened');
  return { state: 'valid', bundle };
}

function resolveLocalDemoShare(token: string): TemporaryShareResolution {
  const share = localDemoShares.get(hashToken(token));
  if (!share) return { state: 'invalid' };
  if (share.revoked_at) return { state: 'revoked' };
  if (new Date(share.expires_at).getTime() <= Date.now()) {
    if (!share.expired_audited_at) { share.expired_audited_at = new Date().toISOString(); share.audit.push('expired'); }
    return { state: 'expired' };
  }
  share.audit.push('opened');
  return { state: 'valid', bundle: cannedDemoBundle };
}

/** Resolves a raw token server-side only; raw tokens are never stored remotely. */
export async function resolveTemporaryShare(token: string): Promise<TemporaryShareResolution> {
  if (!token || token.length < 20) return { state: 'invalid' };
  const client = createSupabaseServerClient();
  try {
    return client ? await resolveRemoteShare(client, token) : resolveLocalDemoShare(token);
  } catch {
    return { state: 'invalid' };
  }
}

export async function revokeTemporaryShare(shareId: string, handoverId: string, confirmation: ShareConfirmation): Promise<TemporaryShareState> {
  if (confirmation.handoverId !== handoverId || !confirmation.confirmedBy.trim() || !confirmation.confirmedAt || !confirmation.attestation.trim()) {
    throw new TemporaryShareError('Carer confirmation is required before revoking a temporary share.', 403);
  }
  const client = createSupabaseServerClient();
  if (!client) {
    const share = [...localDemoShares.values()].find((item) => item.id === shareId && item.handover_id === handoverId);
    if (!share) return 'invalid';
    if (!share.revoked_at) { share.revoked_at = new Date().toISOString(); share.audit.push('revoked'); }
    return 'revoked';
  }

  await assertConfirmedHandover(client, handoverId);
  const rows = await client.request<RemoteShareRow[]>(`temporary_handover_shares?id=eq.${encodeURIComponent(shareId)}&handover_id=eq.${encodeURIComponent(handoverId)}&select=id,handover_id,expires_at,revoked_at,expired_audited_at`);
  const share = rows[0];
  if (!share) return 'invalid';
  if (share.revoked_at) return 'revoked';
  if (new Date(share.expires_at).getTime() <= Date.now()) return 'expired';
  await client.request(`temporary_handover_shares?id=eq.${encodeURIComponent(shareId)}&revoked_at=is.null`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ revoked_at: new Date().toISOString() }) });
  await audit(client, shareId, 'revoked');
  return 'revoked';
}
