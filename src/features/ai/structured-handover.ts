import 'server-only';

import type { CareEvent, Handover, HandoverFallbackCategory, HandoverGeneration, HandoverSection } from '@/types/care';

import { classifyCareEvent, generateDeterministicHandover } from './generate-handover';
import type { GenerateHandoverInput, HandoverValidationIssue, StructuredHandoverOutput } from './types';

const OPENAI_TIMEOUT_MS = 8_000;
const ALLOWED_SECTIONS: readonly HandoverSection[] = ['recorded_updates', 'observations', 'daily_living', 'mobility', 'appointments'];
const ALLOWED_UNRESOLVED_REASONS = ['uncertain_or_incomplete', 'conflicting_information', 'restricted_source_language'] as const;

export interface StructuredHandoverProvider {
  generate(events: readonly CareEvent[]): Promise<unknown>;
}

export interface StructuredHandoverResult {
  handover: Handover;
  generation: HandoverGeneration;
}

function sectionForEvent(event: CareEvent): HandoverSection {
  switch (event.category) {
    case 'vitals': return 'observations';
    case 'support_visit': return 'daily_living';
    case 'mobility': return 'mobility';
    case 'appointment': return 'appointments';
    default: return 'recorded_updates';
  }
}

function fallback(input: GenerateHandoverInput, warning: string, fallbackCategory: HandoverFallbackCategory, providerStatus?: number): StructuredHandoverResult {
  // Keep provider diagnostics out of the care-facing UI. This contains no source
  // content or credentials, and lets operators investigate a degraded integration.
  console.warn('CareRelay handover generation used the deterministic fallback.', { fallbackCategory, providerStatus });
  const handover = generateDeterministicHandover(input);
  const eventById = new Map(input.events.map((event) => [event.id, event]));
  return {
    handover: {
      ...handover,
      claims: handover.claims.map((claim) => ({ ...claim, section: sectionForEvent(eventById.get(claim.sourceEventIds[0])!) })),
    },
    generation: { mode: 'deterministic_fallback', warnings: [warning], fallbackCategory, providerStatus },
  };
}

class OpenAiProviderError extends Error {
  constructor(readonly category: Exclude<HandoverFallbackCategory, 'missing_configuration' | 'care_relay_validation'>, readonly status?: number) {
    super(category);
    this.name = 'OpenAiProviderError';
  }
}

function categoryForHttpStatus(status: number): Exclude<HandoverFallbackCategory, 'missing_configuration' | 'care_relay_validation'> {
  if (status === 401 || status === 403 || status === 429) return 'authentication_or_access';
  if (status === 400 || status === 404 || status === 422) return 'unsupported_model_or_request';
  return 'network_failure';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isKnownSection(value: unknown): value is HandoverSection {
  return typeof value === 'string' && (ALLOWED_SECTIONS as readonly string[]).includes(value);
}

function sourceIds(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.length !== 1 || value.some((item) => typeof item !== 'string' || !item.trim())) return undefined;
  return value;
}

/**
 * Validates a provider payload independently of the provider's JSON schema.
 * Each supplied event must be classified exactly once. Events already marked
 * uncertain, incomplete, or restricted by P0's deterministic rules cannot be
 * promoted to a factual claim.
 */
export function validateStructuredHandoverOutput(output: unknown, events: readonly CareEvent[]): HandoverValidationIssue[] {
  const issues: HandoverValidationIssue[] = [];
  if (!isRecord(output) || Object.keys(output).some((key) => key !== 'claims' && key !== 'unresolved') || !Array.isArray(output.claims) || !Array.isArray(output.unresolved)) {
    return [{ path: 'output', message: 'Structured output must contain only claims and unresolved arrays.' }];
  }

  const eventById = new Map(events.map((event) => [event.id, event]));
  const assignment = new Map<string, 'claim' | 'unresolved'>();
  const addAssignment = (eventId: string, destination: 'claim' | 'unresolved', path: string) => {
    if (!eventById.has(eventId)) issues.push({ path, message: 'Output cites an event ID that was not supplied.' });
    else if (assignment.has(eventId)) issues.push({ path, message: 'Each source event must appear exactly once.' });
    else assignment.set(eventId, destination);
  };

  output.claims.forEach((claim, index) => {
    const path = `claims[${index}]`;
    if (!isRecord(claim) || Object.keys(claim).some((key) => key !== 'section' && key !== 'sourceEventIds') || !isKnownSection(claim.section)) {
      issues.push({ path, message: 'Claim has an unsupported section or fields.' });
      return;
    }
    const ids = sourceIds(claim.sourceEventIds);
    if (!ids) {
      issues.push({ path, message: 'Each claim must cite exactly one non-empty supplied source event ID.' });
      return;
    }
    const event = eventById.get(ids[0]);
    if (event && classifyCareEvent(event).destination !== 'claim') {
      issues.push({ path, message: 'Uncertain, incomplete, or restricted source evidence must remain unresolved.' });
    }
    addAssignment(ids[0], 'claim', path);
  });

  output.unresolved.forEach((item, index) => {
    const path = `unresolved[${index}]`;
    if (!isRecord(item) || Object.keys(item).some((key) => key !== 'reason' && key !== 'sourceEventIds') || typeof item.reason !== 'string' || !(ALLOWED_UNRESOLVED_REASONS as readonly string[]).includes(item.reason)) {
      issues.push({ path, message: 'Unresolved item has an unsupported reason or fields.' });
      return;
    }
    const ids = sourceIds(item.sourceEventIds);
    if (!ids) {
      issues.push({ path, message: 'Each unresolved item must cite exactly one non-empty supplied source event ID.' });
      return;
    }
    addAssignment(ids[0], 'unresolved', path);
  });

  for (const event of events) {
    const expected = classifyCareEvent(event).destination;
    const actual = assignment.get(event.id);
    if (!actual) issues.push({ path: 'output', message: `Source event ${event.id} is missing from the structured output.` });
    else if (actual !== expected) issues.push({ path: 'output', message: `Source event ${event.id} must remain ${expected === 'claim' ? 'a claim' : 'unresolved'}.` });
  }
  return issues;
}

function materializeValidatedStructure(input: GenerateHandoverInput, output: StructuredHandoverOutput): Handover {
  const deterministic = generateDeterministicHandover(input);
  const sectionBySource = new Map(output.claims.map((selection) => [selection.sourceEventIds[0], selection.section]));
  return {
    ...deterministic,
    // Keep the source-record order even if the provider returns a different order.
    claims: deterministic.claims.map((claim) => ({
      ...claim,
      section: sectionBySource.get(claim.sourceEventIds[0])!,
    })),
    // The existing deterministic wording is retained so provider prose can never override source records.
    unresolved: deterministic.unresolved,
  };
}

function responseSchema(events: readonly CareEvent[]): object {
  const eventIds = events.map((event) => event.id);
  const citedSource = { type: 'array', items: { type: 'string', enum: eventIds }, minItems: 1, maxItems: 1 };
  return {
    type: 'object', additionalProperties: false, required: ['claims', 'unresolved'], properties: {
      claims: {
        type: 'array', items: {
          type: 'object', additionalProperties: false, required: ['section', 'sourceEventIds'], properties: {
            section: { type: 'string', enum: ALLOWED_SECTIONS }, sourceEventIds: citedSource,
          },
        },
      },
      unresolved: {
        type: 'array', items: {
          type: 'object', additionalProperties: false, required: ['reason', 'sourceEventIds'], properties: {
            reason: { type: 'string', enum: ALLOWED_UNRESOLVED_REASONS }, sourceEventIds: citedSource,
          },
        },
      },
    },
  };
}

function openAiProvider(apiKey: string): StructuredHandoverProvider {
  return {
    async generate(events) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);
      try {
        let response: Response;
        try {
          response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: 'gpt-5-mini',
            messages: [
              { role: 'system', content: 'You structure a CareRelay handover. Return only the requested JSON. Assign every supplied source event exactly once. Do not create prose, advice, diagnoses, triage, treatment, medication, people, timings, outcomes, or source IDs. Put uncertain, incomplete, negative, or restricted evidence in unresolved.' },
              { role: 'user', content: JSON.stringify({ sourceEvents: events.map(({ id, occurredAt, category, authorLabel, narrative }) => ({ id, occurredAt, category, authorLabel, narrative })) }) },
            ],
            response_format: { type: 'json_schema', json_schema: { name: 'care_relay_handover_structure', strict: true, schema: responseSchema(events) } },
          }),
          });
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') throw new OpenAiProviderError('provider_timeout');
          throw new OpenAiProviderError('network_failure');
        }
        if (!response.ok) throw new OpenAiProviderError(categoryForHttpStatus(response.status), response.status);
        let body: { choices?: Array<{ message?: { content?: unknown } }> };
        try {
          body = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> };
        } catch {
          throw new OpenAiProviderError('response_parsing', response.status);
        }
        const content = body.choices?.[0]?.message?.content;
        if (typeof content !== 'string') throw new OpenAiProviderError('response_parsing', response.status);
        try {
          return JSON.parse(content) as unknown;
        } catch {
          throw new OpenAiProviderError('response_parsing', response.status);
        }
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

/** Server-only entry point. It never persists provider output and always has an offline deterministic result. */
export async function generateStructuredHandover(input: GenerateHandoverInput, provider?: StructuredHandoverProvider): Promise<StructuredHandoverResult> {
  const configuredProvider = provider ?? (process.env.OPENAI_API_KEY ? openAiProvider(process.env.OPENAI_API_KEY) : undefined);
  if (!configuredProvider) return fallback(input, 'OpenAI is not configured; showing the deterministic evidence-led fallback.', 'missing_configuration');
  try {
    const output = await configuredProvider.generate(input.events);
    const issues = validateStructuredHandoverOutput(output, input.events);
    if (issues.length > 0) return fallback(input, 'OpenAI output did not pass evidence validation; showing the deterministic evidence-led fallback.', 'care_relay_validation');
    return { handover: materializeValidatedStructure(input, output as StructuredHandoverOutput), generation: { mode: 'openai', warnings: [] } };
  } catch (error) {
    if (error instanceof OpenAiProviderError) return fallback(input, 'OpenAI was unavailable or timed out; showing the deterministic evidence-led fallback.', error.category, error.status);
    return fallback(input, 'OpenAI was unavailable or timed out; showing the deterministic evidence-led fallback.', 'network_failure');
  }
}
