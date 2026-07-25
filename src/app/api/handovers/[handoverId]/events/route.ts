import { NextResponse } from 'next/server';

import { DEMO_HANDOVER_ID } from '@/lib/demo-data';
import { createHandoverRepository } from '@/lib/supabase/handover-repository';
import type { CareEvent } from '@/types/care';

function isReviewedEvent(value: unknown): value is CareEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as Partial<CareEvent>;
  return typeof event.id === 'string' && typeof event.patientId === 'string' && typeof event.occurredAt === 'string' && typeof event.authorLabel === 'string' && typeof event.narrative === 'string'
    && ['carer_note', 'support_visit', 'vitals', 'mobility', 'appointment'].includes(event.category ?? '')
    && ['clinician', 'professional_caregiver', 'patient', 'family_informal_caregiver'].includes(event.contributorRole ?? '')
    && ['typed', 'voice'].includes(event.provenance ?? '')
    && ['reviewed_observation', 'needs_clarification'].includes(event.reviewStatus ?? '');
}

/** Writes only explicitly reviewed synthetic source events after the additive migration is manually applied. */
export async function POST(request: Request, { params }: { params: Promise<{ handoverId: string }> }) {
  const { handoverId } = await params;
  const body = await request.json() as { event?: unknown };
  if (handoverId !== DEMO_HANDOVER_ID || !isReviewedEvent(body.event)) return NextResponse.json({ error: 'A complete reviewed source event is required.' }, { status: 400 });
  try {
    const repository = createHandoverRepository();
    if (!repository) return NextResponse.json({ delivery: 'local_demo' }, { status: 503 });
    const bundle = await repository.appendReviewedEvent(handoverId, body.event);
    if (!bundle) return NextResponse.json({ error: 'The reviewed source event could not be added.' }, { status: 400 });
    return NextResponse.json({ delivery: 'remote', bundle });
  } catch {
    return NextResponse.json({ delivery: 'local_demo' }, { status: 503 });
  }
}
