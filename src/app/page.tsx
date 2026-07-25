import { HandoverScreen } from '@/components/handover-screen';
import { cannedDemoBundle } from '@/lib/demo-data';
import { hasTraceableEvidence } from '@/lib/handover';
import { createHandoverRepository } from '@/lib/supabase/handover-repository';

export default async function HomePage() {
  // Remote persistence is optional and restricted to the frozen P0 demo ID.
  // Any missing configuration, remote error, or invalid record returns to the reliable canned demo.
  let bundle = cannedDemoBundle;
  try {
    bundle = (await createHandoverRepository()?.getBundle(cannedDemoBundle.handover.id)) ?? cannedDemoBundle;
  } catch {
    bundle = cannedDemoBundle;
  }
  if (!hasTraceableEvidence(bundle.handover, bundle.events)) bundle = cannedDemoBundle;
  return <HandoverScreen bundle={bundle} />;
}
