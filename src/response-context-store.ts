import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ChatMessage } from './types/chat.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.STORE_DATA_DIR || join(__dirname, '..', 'data');
const CONTEXT_DIR = join(DATA_DIR, 'context');
const INDEX_FILE = join(DATA_DIR, 'context-index.json');
const MAX_CONTEXTS = 200;

interface IndexEntry {
  id: string;
  createdAt: number;
  touchedAt: number;
}

let index = new Map<string, IndexEntry>();
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

function ensureContextDir(): void {
  if (!existsSync(CONTEXT_DIR)) {
    mkdirSync(CONTEXT_DIR, { recursive: true });
  }
}

function loadIndex(): void {
  if (loaded) return;
  loaded = true;
  try {
    if (existsSync(INDEX_FILE)) {
      const raw = readFileSync(INDEX_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        index = new Map<string, IndexEntry>();
        for (const entry of parsed) {
          if (entry && typeof entry.id === 'string') {
            index.set(entry.id, {
              id: entry.id,
              createdAt: typeof entry.createdAt === 'number' ? entry.createdAt : Date.now(),
              touchedAt: typeof entry.touchedAt === 'number' ? entry.touchedAt : Date.now(),
            });
          }
        }
      }
    }
  } catch {
    index = new Map<string, IndexEntry>();
  }
}

function persistIndex(): void {
  const entries: IndexEntry[] = [...index.values()].sort((a, b) => a.createdAt - b.createdAt);
  try {
    ensureContextDir();
    writeFileSync(INDEX_FILE, JSON.stringify(entries), 'utf-8');
  } catch {
    // disk full or permission issue — fail silently
  }
}

function contextFilePath(id: string): string {
  return join(CONTEXT_DIR, `${id.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`);
}

function saveToFile(id: string, messages: ChatMessage[]): void {
  ensureContextDir();
  const entry = index.get(id);
  if (!entry) return;
  entry.touchedAt = Date.now();
  try {
    writeFileSync(contextFilePath(id), JSON.stringify(messages), 'utf-8');
    persistIndex();
  } catch {
    // best effort
  }
}

function trimIndex(): void {
  if (index.size <= MAX_CONTEXTS) return;
  const oldest = [...index.values()].sort((a, b) => a.createdAt - b.createdAt).slice(0, index.size - MAX_CONTEXTS);
  for (const entry of oldest) {
    index.delete(entry.id);
    try {
      const path = contextFilePath(entry.id);
      if (existsSync(path)) unlinkSync(path);
    } catch {
      // best effort
    }
  }
  persistIndex();
}

export function saveResponseContext(id: string, messages: ChatMessage[]): void {
  if (!id) return;
  loadIndex();
  index.set(id, { id, createdAt: Date.now(), touchedAt: Date.now() });
  saveToFile(id, messages);
  trimIndex();
}

export function getResponseContext(id: string): ChatMessage[] | null {
  loadIndex();
  const entry = index.get(id);
  if (!entry) return null;
  entry.touchedAt = Date.now();
  persistIndex();
  const path = contextFilePath(id);
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return cloneMessages(parsed);
  } catch {
    return null;
  }
}

export function clearResponseContexts(): void {
  loadIndex();
  for (const entry of index.values()) {
    try {
      const path = contextFilePath(entry.id);
      if (existsSync(path)) unlinkSync(path);
    } catch {
      // best effort
    }
  }
  index.clear();
  try {
    if (existsSync(INDEX_FILE)) writeFileSync(INDEX_FILE, '[]', 'utf-8');
  } catch {
    // best effort
  }
}

/** Test-only: clear only in-memory index, preserving disk files (simulates restart). */
export function _resetMemoryOnly(): void {
  index.clear();
  loaded = false;
}
