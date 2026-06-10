import type { ChatMessage } from './types/chat.ts';

interface StoredResponseContext {
  id: string;
  messages: ChatMessage[];
  createdAt: number;
}

const contexts = new Map<string, StoredResponseContext>();
const MAX_CONTEXTS = 200;

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

function trimContexts(): void {
  if (contexts.size <= MAX_CONTEXTS) return;
  const oldest = [...contexts.values()].sort((a, b) => a.createdAt - b.createdAt).slice(0, contexts.size - MAX_CONTEXTS);
  for (const item of oldest) contexts.delete(item.id);
}

export function saveResponseContext(id: string, messages: ChatMessage[]): void {
  if (!id) return;
  contexts.set(id, { id, messages: cloneMessages(messages), createdAt: Date.now() });
  trimContexts();
}

export function getResponseContext(id: string): ChatMessage[] | null {
  const hit = contexts.get(id);
  return hit ? cloneMessages(hit.messages) : null;
}

export function clearResponseContexts(): void {
  contexts.clear();
}
