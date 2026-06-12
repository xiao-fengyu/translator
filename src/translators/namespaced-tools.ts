export const NAMESPACE_TOOL_SEPARATOR = '__';

export function flattenNamespacedToolName(namespace: string, name: string): string {
  return `${namespace}${NAMESPACE_TOOL_SEPARATOR}${name}`;
}

export function splitNamespacedToolName(name: string): { namespace?: string; name: string } {
  const separator = NAMESPACE_TOOL_SEPARATOR;
  const index = name.lastIndexOf(separator);
  if (index <= 0 || index >= name.length - separator.length) return { name };

  const namespace = name.slice(0, index);
  const toolName = name.slice(index + separator.length);
  if (!namespace.startsWith('mcp__')) return { name };
  return { namespace, name: toolName };
}
