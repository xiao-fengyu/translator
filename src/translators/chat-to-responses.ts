function responseId(): string {
  return `resp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function stringifyToolArguments(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value == null) return '{}';
  return JSON.stringify(value);
}

export function extractChatText(chatResponse: any): string {
  const choices = Array.isArray(chatResponse?.choices) ? chatResponse.choices : [];
  const first = choices[0] || {};
  const content = first.message?.content ?? first.delta?.content ?? '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((item) => typeof item === 'string' ? item : item?.text || item?.content || '').join('');
  }
  return content == null ? '' : String(content);
}

export function extractChatToolCalls(chatResponse: any): any[] {
  const choices = Array.isArray(chatResponse?.choices) ? chatResponse.choices : [];
  const first = choices[0] || {};
  const calls = first.message?.tool_calls ?? first.delta?.tool_calls ?? [];
  return Array.isArray(calls) ? calls : [];
}

function chatToolCallToResponseOutput(toolCall: any, index: number): any {
  const id = toolCall?.id || `call_${Date.now().toString(36)}_${index}`;
  const fn = toolCall?.function || {};
  return {
    id,
    type: 'function_call',
    status: 'completed',
    call_id: id,
    name: typeof fn.name === 'string' ? fn.name : 'unknown_function',
    arguments: stringifyToolArguments(fn.arguments),
  };
}

export function chatToResponses(chatResponse: any, model: string): any {
  const text = extractChatText(chatResponse);
  const toolCalls = extractChatToolCalls(chatResponse);
  const id = chatResponse?.id || responseId();
  const output: any[] = [];

  if (text) {
    output.push({
      id: `msg_${id}`,
      type: 'message',
      status: 'completed',
      role: 'assistant',
      content: [
        {
          type: 'output_text',
          text,
          annotations: [],
        },
      ],
    });
  }

  output.push(...toolCalls.map(chatToolCallToResponseOutput));

  // Preserve an empty assistant message for pure-empty responses, but avoid
  // adding one when the response only contains tool calls.
  if (output.length === 0) {
    output.push({
      id: `msg_${id}`,
      type: 'message',
      status: 'completed',
      role: 'assistant',
      content: [{ type: 'output_text', text: '', annotations: [] }],
    });
  }

  return {
    id,
    object: 'response',
    created_at: Math.floor(Date.now() / 1000),
    status: 'completed',
    model: chatResponse?.model || model,
    output,
    output_text: text,
    usage: chatResponse?.usage || null,
  };
}

export const internals = { stringifyToolArguments, chatToolCallToResponseOutput };
