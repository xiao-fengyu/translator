import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ChatMessage } from './types/chat.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.STORE_DATA_DIR || join(__dirname, '..', 'data');
const STORE_FILE = join(DATA_DIR, 'response-contexts.json');
const MAX_CONTEXTS = 200;

interface StoredContext {
  id: string;
  messages: ChatMessage[];
  createdAt: number;
}

let contexts = new Map<string, StoredContext>();
let loaded = false;

function cloneMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
    ...(message.name === undefined ? {} : { name: message.name }),
    ...(message.tool_call_id === undefined ? {} : { tool_call_id: message.tool_call_id }),
    ...(message.tool_calls === undefined
      ? {}
      : {
          tool_calls: message.tool_calls.map((toolCall) => ({
            ...toolCall,
            function: { ...toolCall.function },
          })),
        }),
  }));
}

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function load(): void {
  if (loaded) return;
  loaded = true;
  try {
    if (!existsSync(STORE_FILE)) return;
    const raw = readFileSync(STORE_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      contexts.clear();
      return;
    }
    contexts = new Map<string, StoredContext>();
    for (const item of parsed) {
      if (item && typeof item.id === 'string' && Array.isArray(item.messages)) {
        contexts.set(item.id, {
          id: item.id,
          messages: cloneMessages(item.messages),
          createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
        });
      }
    }
  } catch {
    contexts.clear();
  }
}

function persist(): void {
  ensureDataDir();
  const items: StoredContext[] = [...contexts.values()].sort((a, b) => a.createdAt - b.createdAt).slice(-MAX_CONTEXTS);
  try {
    writeFileSync(STORE_FILE, JSON.stringify(items), 'utf-8');
  } catch {
    // disk full or permission issue — fail silently, contexts remain in memory
  }
}

function trimContexts(): void {
  if (contexts.size <= MAX_CONTEXTS) return;
  const oldest = [...contexts.values()].sort((a, b) => a.createdAt - b.createdAt).slice(0, contexts.size - MAX_CONTEXTS);
  for (const item of oldest) contexts.delete(item.id);
  persist();
}

export function saveResponseContext(id: string, messages: ChatMessage[]): void {
  if (!id) return;
  load();
  contexts.set(id, { id, messages: cloneMessages(messages), createdAt: Date.now() });
  trimContexts();
  persist();
}

export function getResponseContext(id: string): ChatMessage[] | null {
  load();
  const hit = contexts.get(id);
  return hit ? cloneMessages(hit.messages) : null;
}

export function clearResponseContexts(): void {
  contexts.clear();
  try {
    if (existsSync(STORE_FILE)) writeFileSync(STORE_FILE, '[]', 'utf-8');
  } catch {
    // best effort
  }
}

/** Test-only: clear only in-memory cache, preserving disk file (simulates restart). */
export function _resetMemoryOnly(): void {
  contexts.clear();
  loaded = false;
}
