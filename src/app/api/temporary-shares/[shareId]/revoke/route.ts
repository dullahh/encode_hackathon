import { NextResponse } from 'next/server';

import { revokeTemporaryShare, TemporaryShareError } from '@/lib/temporary-shares';
import type { ShareConfirmation } from '@/types/care';

export async function POST(request: Request, { params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await params;
  const body = await request.json() as { handoverId?: string; confirmation?: ShareConfirmation };
  if (!body.handoverId || !body.confirmation) return NextResponse.json({ error: 'Carer confirmation is required.' }, { status: 400 });
  try {
    const state = await revokeTemporaryShare(shareId, body.handoverId, body.confirmation);
    // Deliberately generic: a caller cannot infer whether another record exists.
    if (state === 'invalid') return NextResponse.json({ error: 'This temporary share is unavailable.' }, { status: 404 });
    return NextResponse.json({ state });
  } catch (error) {
    const status = error instanceof TemporaryShareError ? error.status : 503;
    return NextResponse.json({ error: 'Temporary sharing is currently unavailable.' }, { status });
  }
}
