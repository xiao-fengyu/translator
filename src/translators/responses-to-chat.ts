import { config } from '../config.ts';
import { getResponseContext } from '../response-context-store.ts';
import type { ChatCompletionsRequest, ChatMessage, ChatTool } from '../types/chat.ts';
import type { ResponsesRequest, ResponsesTool } from '../types/responses.ts';

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
    if (typeof obj.output === 'string') return obj.output;
    if (typeof obj.type === 'string' && obj.type.includes('text') && typeof obj.value === 'string') return obj.value;
    return JSON.stringify(obj);
  }
  return String(value);
}

function instructionToSystemMessage(instructions: unknown): ChatMessage[] {
  const content = stringifyContent(instructions).trim();
  return content ? [{ role: 'system', content }] : [];
}

function responseToolToChatTool(tool: ResponsesTool): ChatTool | null {
  const fn = tool.function || tool;
  const name = typeof fn.name === 'string' ? fn.name : '';
  if (!name) return null;
  return {
    type: 'function',
    function: {
      name,
      description: typeof fn.description === 'string' ? fn.description : undefined,
      parameters: fn.parameters || {},
    },
  };
}

function responseToolChoiceToChatToolChoice(choice: unknown): unknown {
  if (choice == null || typeof choice === 'string') return choice;
  if (typeof choice !== 'object') return choice;
  const obj = choice as Record<string, unknown>;
  if (obj.type === 'function' && typeof obj.name === 'string') {
    return { type: 'function', function: { name: obj.name } };
  }
  return choice;
}

function inputItemToMessages(item: unknown): ChatMessage[] {
  if (item == null) return [];
  if (typeof item === 'string') return [{ role: 'user', content: item }];
  if (Array.isArray(item)) return item.flatMap(inputItemToMessages);
  if (typeof item !== 'object') return [{ role: 'user', content: stringifyContent(item) }];

  const obj = item as Record<string, unknown>;
  const type = typeof obj.type === 'string' ? obj.type : '';

  // Responses API function-call output from a previous assistant turn.
  // Convert it into Chat Completions assistant tool_calls so the next upstream
  // request keeps structured agent state instead of degrading to text.
  if (type === 'function_call') {
    const name = typeof obj.name === 'string' ? obj.name : 'unknown_function';
    const callId = typeof obj.call_id === 'string' ? obj.call_id : typeof obj.id === 'string' ? obj.id : `call_${name}`;
    const args = typeof obj.arguments === 'string' ? obj.arguments : JSON.stringify(obj.arguments ?? {});
    return [{
      role: 'assistant',
      content: null,
      tool_calls: [{ id: callId, type: 'function', function: { name, arguments: args } }],
    }];
  }

  // Responses API function/tool result sent back by Codex.
  if (type === 'function_call_output' || type === 'tool_result' || type === 'tool_output') {
    const callId = typeof obj.call_id === 'string' ? obj.call_id : typeof obj.tool_call_id === 'string' ? obj.tool_call_id : '';
    return [{ role: 'tool', tool_call_id: callId, content: stringifyContent(obj.output ?? obj.content ?? obj.result) }];
  }

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
  const messages = inputItemToMessages(input).filter((m) => m.content === null || (m.content || '').trim() || m.tool_calls?.length);
  return messages.length > 0 ? messages : [{ role: 'user', content: '' }];
}

function mergePreviousMessages(previousResponseId: unknown, nextMessages: ChatMessage[]): ChatMessage[] {
  if (typeof previousResponseId !== 'string' || !previousResponseId.trim()) return nextMessages;
  const previous = getResponseContext(previousResponseId.trim());
  if (!previous) return nextMessages;
  return [...previous, ...nextMessages];
}

export function responsesToChat(request: ResponsesRequest): ChatCompletionsRequest {
  const model = request.model || config.defaultModel;
  const messages = mergePreviousMessages(request.previous_response_id, [
    ...instructionToSystemMessage(request.instructions),
    ...inputToMessages(request.input),
  ]);

  const chatRequest: ChatCompletionsRequest = {
    model,
    messages,
    stream: Boolean(request.stream),
  };

  if (typeof request.temperature === 'number') chatRequest.temperature = request.temperature;
  if (typeof request.max_output_tokens === 'number') chatRequest.max_tokens = request.max_output_tokens;
  if (typeof request.max_completion_tokens === 'number') chatRequest.max_completion_tokens = request.max_completion_tokens;
  if (Array.isArray(request.tools)) {
    const tools = request.tools.map(responseToolToChatTool).filter((tool): tool is ChatTool => Boolean(tool));
    if (tools.length > 0) chatRequest.tools = tools;
  }
  if (request.tool_choice !== undefined) chatRequest.tool_choice = responseToolChoiceToChatToolChoice(request.tool_choice);
  if (typeof request.parallel_tool_calls === 'boolean') chatRequest.parallel_tool_calls = request.parallel_tool_calls;

  return chatRequest;
}

export const internals = { stringifyContent, inputToMessages, responseToolToChatTool, responseToolChoiceToChatToolChoice, mergePreviousMessages };
