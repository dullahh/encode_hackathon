import { HandoverScreen } from '@/components/handover-screen';
import { resolveTemporaryShare } from '@/lib/temporary-shares';

export const dynamic = 'force-dynamic';

export default async function TemporarySharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await resolveTemporaryShare(token);
  if (result.state !== 'valid' || !result.bundle) {
    return <main className="share-state"><h1>Temporary handover unavailable</h1><p>This temporary handover link is invalid, expired, or no longer active.</p></main>;
  }
  return <HandoverScreen bundle={result.bundle} readOnly />;
}
