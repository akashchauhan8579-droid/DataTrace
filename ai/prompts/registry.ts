import type { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

export interface PromptSegment {
  ordinal: number;
  locatorType: string;
  locator: Record<string, unknown>;
  text: string;
}

export interface PromptScopeItem {
  evidenceDisplayId: string;
  segments: PromptSegment[];
}

export interface PromptFindingContext {
  displayId: string;
  statement: string;
  normalizedClaim?: unknown;
}

export interface PromptInput {
  scope: PromptScopeItem[];
  findingContext?: PromptFindingContext[];
  extra?: Record<string, unknown>;
}

export interface PromptDefinition {
  id: string;
  version: string;
  taskType: string;
  build(input: PromptInput): { system: string; user: string };
  outputSchema: z.ZodTypeAny;
}

const prompts = new Map<string, PromptDefinition>();

const registryKey = (id: string, version: string): string => `${id}@${version}`;

/** Prompts are immutable. Registering the same id+version twice is a programmer error and throws. */
export function registerPrompt(def: PromptDefinition): void {
  const key = registryKey(def.id, def.version);
  if (prompts.has(key)) {
    throw new Error(`Prompt already registered: ${key}`);
  }
  prompts.set(key, def);
}

export function getPrompt(id: string, version: string): PromptDefinition | undefined {
  return prompts.get(registryKey(id, version));
}

const DATA_TAG = 'evidence_data';

/**
 * Neutralises any attempt by evidence text (or header text) to open or close the data block.
 * `</evidence_data>` becomes `<\/evidence_data>`; an opening tag becomes `<\evidence_data>`.
 */
function neutralise(text: string): string {
  return text
    .replace(new RegExp(`<\\s*/\\s*${DATA_TAG}`, 'gi'), `<\\/${DATA_TAG}`)
    .replace(new RegExp(`<\\s*${DATA_TAG}`, 'gi'), `<\\${DATA_TAG}`);
}

/**
 * Renders every segment under a header like `[EV-101 #3 PAGE {"page":2}]`, followed by the segment text.
 * The whole block is wrapped in <evidence_data> ... </evidence_data>.
 * Only display ID, ordinal, locatorType, locator and text are read; any other field on the input is ignored.
 */
export function renderSegments(scope: PromptInput['scope']): string {
  const blocks: string[] = [];
  for (const item of scope) {
    for (const seg of item.segments) {
      const header = `[${item.evidenceDisplayId} #${seg.ordinal} ${seg.locatorType} ${JSON.stringify(seg.locator)}]`;
      blocks.push(`${neutralise(header)}\n${neutralise(seg.text)}`);
    }
  }
  const body = blocks.join('\n\n');
  return body.length > 0
    ? `<${DATA_TAG}>\n${body}\n</${DATA_TAG}>`
    : `<${DATA_TAG}>\n</${DATA_TAG}>`;
}

/** JSON Schema from a Zod v3 schema (zod-to-json-schema). Refs are inlined so providers get one flat document. */
export function jsonSchemaFor(schema: z.ZodTypeAny): Record<string, unknown> {
  return zodToJsonSchema(schema, { $refStrategy: 'none' }) as Record<string, unknown>;
}