import { NextResponse } from 'next/server';
import { cannedDemoBundle, cannedDraftBundle, DEMO_DRAFT_HANDOVER_ID, DEMO_HANDOVER_ID } from '@/lib/demo-data';
import type { ShareHandoverRequest, ShareHandoverResponse } from '@/types/care';
import { createHandoverRepository } from '@/lib/supabase/handover-repository';
import { confirmLocalDemoDraft } from '@/lib/temporary-shares';

export async function POST(request: Request, { params }: { params: Promise<{ handoverId: string }> }) {
  const { handoverId } = await params;
  const body = await request.json() as ShareHandoverRequest;
  if ((handoverId !== DEMO_HANDOVER_ID && handoverId !== DEMO_DRAFT_HANDOVER_ID) || body.confirmation?.handoverId !== handoverId || !body.confirmation?.confirmedBy || !body.confirmation?.confirmedAt || !body.confirmation?.attestation) return NextResponse.json({ error: 'A complete carer confirmation is required before sharing.' }, { status: 400 });
  if (handoverId === DEMO_DRAFT_HANDOVER_ID) {
    // This explicitly started synthetic draft is local-only; never create remote records implicitly.
    confirmLocalDemoDraft(handoverId);
    return NextResponse.json({ handover: { ...cannedDraftBundle.handover, status: 'shared' }, confirmation: body.confirmation, delivery: 'canned_demo' } satisfies ShareHandoverResponse);
  }
  // Credentials, if configured, are read only by the server-side repository.
  // Any persistence failure safely continues through the deterministic canned demo.
  try {
    const repository = createHandoverRepository();
    if (repository) {
      // Preserve any previously persisted, explicitly reviewed synthetic intake events.
      await repository.saveBundle((await repository.getBundle(handoverId)) ?? cannedDemoBundle);
      const handover = await repository.confirmAndShare(body.confirmation);
      if (handover) return NextResponse.json({ handover, confirmation: body.confirmation, delivery: 'remote' } satisfies ShareHandoverResponse);
    }
  } catch {
    // The offline canned demo remains usable when Supabase is unreachable.
  }
  const result: ShareHandoverResponse = { handover: { ...cannedDemoBundle.handover, status: 'shared' }, confirmation: body.confirmation, delivery: 'canned_demo' };
  return NextResponse.json(result);
}
