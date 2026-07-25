import { notFound } from 'next/navigation';
import { HandoverScreen } from '@/components/handover-screen';
import { presentHandover } from '@/features/ai/present-handover';
import { cannedDemoBundle, DEMO_HANDOVER_ID } from '@/lib/demo-data';

export const dynamic = 'force-dynamic';

export default async function HandoverPage({ params }: { params: Promise<{ handoverId: string }> }) {
  const { handoverId } = await params;
  if (handoverId !== DEMO_HANDOVER_ID) notFound();
  return <HandoverScreen bundle={await presentHandover(cannedDemoBundle)} />;
}
