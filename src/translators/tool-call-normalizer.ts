import { fileURLToPath } from 'node:url';

interface NormalizedToolCall {
  name: string;
  arguments: string;
}

function parseObject(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function filePathFromUri(uri: unknown): string | null {
  if (typeof uri !== 'string' || !uri.startsWith('file://')) return null;
  try {
    return fileURLToPath(uri);
  } catch {
    return null;
  }
}

export function isFilesystemResourceReadCandidate(name: string): boolean {
  return name === 'read_mcp_resource' || name === 'mcp__filesystem__read_mcp_resource';
}

export function normalizeToolCall(name: string, args: string): NormalizedToolCall {
  if (!isFilesystemResourceReadCandidate(name)) return { name, arguments: args };

  const parsed = parseObject(args.trim());
  const server = typeof parsed?.server === 'string' ? parsed.server : undefined;
  const filesystemServer = name === 'mcp__filesystem__read_mcp_resource' || server === 'filesystem';
  const path = filesystemServer ? filePathFromUri(parsed?.uri) : null;

  if (!path) return { name, arguments: args };

  return {
    name: 'mcp__filesystem__read_text_file',
    arguments: JSON.stringify({ path }),
  };
}
