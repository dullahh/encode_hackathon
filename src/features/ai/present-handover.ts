import 'server-only';

import type { HandoverBundle } from '@/types/care';

import { generateStructuredHandover } from './structured-handover';

/** Applies the validated, non-persistent presentation layer to a source bundle. */
export async function presentHandover(bundle: HandoverBundle): Promise<HandoverBundle> {
  const result = await generateStructuredHandover({
    id: bundle.handover.id,
    patientId: bundle.patient.id,
    events: bundle.events,
    generatedAt: bundle.handover.generatedAt,
    status: bundle.handover.status,
  });
  // Resolution history is human-authored domain evidence and is never supplied to,
  // or overwritten by, the structural model layer.
  return {
    ...bundle,
    handover: {
      ...result.handover,
      version: bundle.handover.version,
      derivedFromHandoverId: bundle.handover.derivedFromHandoverId,
      resolutionStates: bundle.handover.resolutionStates,
    },
    generation: result.generation,
  };
}
