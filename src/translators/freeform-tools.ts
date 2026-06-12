export const FREEFORM_ARGUMENT_PROPERTY = 'input';

const FREEFORM_TOOL_NAMES = new Set(['apply_patch']);

export function isFreeformToolName(name: string): boolean {
  return FREEFORM_TOOL_NAMES.has(name);
}

export function hasFreeformToolShape(tool: any): boolean {
  const fn = tool?.function || tool || {};
  const name = typeof fn.name === 'string' ? fn.name : '';
  return tool?.type === 'custom' || fn.type === 'custom' || tool?.type === 'freeform' || fn.type === 'freeform' || isFreeformToolName(name);
}

export function freeformToolParameters(): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      [FREEFORM_ARGUMENT_PROPERTY]: {
        type: 'string',
        description: 'Raw freeform input for the tool.',
      },
    },
    required: [FREEFORM_ARGUMENT_PROPERTY],
    additionalProperties: false,
  };
}

function parseObject(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export function wrapFreeformArguments(value: unknown): string {
  if (typeof value === 'string') {
    const parsed = parseObject(value.trim());
    if (typeof parsed?.[FREEFORM_ARGUMENT_PROPERTY] === 'string') return value;
    return JSON.stringify({ [FREEFORM_ARGUMENT_PROPERTY]: value });
  }
  if (value && typeof value === 'object' && !Array.isArray(value) && typeof (value as Record<string, unknown>)[FREEFORM_ARGUMENT_PROPERTY] === 'string') {
    return JSON.stringify(value);
  }
  return JSON.stringify({ [FREEFORM_ARGUMENT_PROPERTY]: value == null ? '' : JSON.stringify(value) });
}

export function unwrapFreeformArguments(value: unknown): string {
  if (typeof value !== 'string') return value == null ? '' : JSON.stringify(value);
  const parsed = parseObject(value.trim());
  const raw = parsed?.[FREEFORM_ARGUMENT_PROPERTY];
  return typeof raw === 'string' ? raw : value;
}
