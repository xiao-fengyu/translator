import { config } from '../config.ts';
import type { ChatCompletionsRequest, ChatMessage } from '../types/chat.ts';
import type { ResponsesRequest } from '../types/responses.ts';

function stringifyContent(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value.map(stringifyContent).filter(Boolean).join('\n');
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (typeof obj.text === 'string') return obj.text;
    if (typeof obj.content === 'string') return obj.content;
    if (Array.isArray(obj.content)) return stringifyContent(obj.content);
    if (typeof obj.input_text === 'string') return obj.input_text;
    if (typeof obj.output_text === 'string') return obj.output_text;
    if (typeof obj.type === 'string' && obj.type.includes('text') && typeof obj.value === 'string') return obj.value;
    return JSON.stringify(obj);
  }
  return String(value);
}

function instructionToSystemMessage(instructions: unknown): ChatMessage[] {
  const content = stringifyContent(instructions).trim();
  return content ? [{ role: 'system', content }] : [];
}

function inputItemToMessages(item: unknown): ChatMessage[] {
  if (item == null) return [];
  if (typeof item === 'string') return [{ role: 'user', content: item }];
  if (Array.isArray(item)) return item.flatMap(inputItemToMessages);
  if (typeof item !== 'object') return [{ role: 'user', content: stringifyContent(item) }];

  const obj = item as Record<string, unknown>;
  const rawRole = typeof obj.role === 'string' ? obj.role : 'user';
  const role = ['system', 'user', 'assistant', 'tool'].includes(rawRole) ? rawRole as ChatMessage['role'] : 'user';

  // Responses API often sends { type: 'message', role, content: [...] }.
  if ('content' in obj) {
    const content = stringifyContent(obj.content).trim();
    return content ? [{ role, content }] : [];
  }

  // Some Codex items may be typed text fragments.
  const content = stringifyContent(obj).trim();
  return content ? [{ role, content }] : [];
}

function inputToMessages(input: unknown): ChatMessage[] {
  const messages = inputItemToMessages(input).filter((m) => m.content.trim());
  return messages.length > 0 ? messages : [{ role: 'user', content: '' }];
}

export function responsesToChat(request: ResponsesRequest): ChatCompletionsRequest {
  const model = request.model || config.defaultModel;
  const messages = [
    ...instructionToSystemMessage(request.instructions),
    ...inputToMessages(request.input),
  ];

  const chatRequest: ChatCompletionsRequest = {
    model,
    messages,
    stream: Boolean(request.stream),
  };

  if (typeof request.temperature === 'number') chatRequest.temperature = request.temperature;
  if (typeof request.max_output_tokens === 'number') chatRequest.max_tokens = request.max_output_tokens;
  if (typeof request.max_completion_tokens === 'number') chatRequest.max_completion_tokens = request.max_completion_tokens;

  return chatRequest;
}

export const internals = { stringifyContent, inputToMessages };
