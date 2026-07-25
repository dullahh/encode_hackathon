import { NextResponse } from 'next/server';

import { getTrustedRequestOrigin } from '@/lib/trusted-origin';
import { createTemporaryShare, TemporaryShareError } from '@/lib/temporary-shares';
import type { ShareHandoverRequest } from '@/types/care';

export async function POST(request: Request, { params }: { params: Promise<{ handoverId: string }> }) {
  const { handoverId } = await params;
  try {
    const body = await request.json() as ShareHandoverRequest;
    const share = await createTemporaryShare(handoverId, getTrustedRequestOrigin(request), body.confirmation);
    return NextResponse.json(share, { status: 201 });
  } catch (error) {
    const status = error instanceof TemporaryShareError ? error.status : 503;
    const message = error instanceof TemporaryShareError ? error.message : 'Temporary sharing is currently unavailable.';
    return NextResponse.json({ error: message }, { status });
  }
}
