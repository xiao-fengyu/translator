import { TextDecoder, TextEncoder } from 'node:util';
import { splitNamespacedToolName } from './namespaced-tools.ts';
import { isFreeformToolName, unwrapFreeformArguments } from './freeform-tools.ts';
import {
  makeGenericStreamFailure,
  makeStreamInterruptedError,
  makeStreamMalformedChunkError,
} from './stream-errors.ts';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function parseDataLine(line: string): string | null {
  if (!line.startsWith('data:')) return null;
  return line.slice(5).trimStart();
}

function extractDelta(chunk: any): string {
  const choice = Array.isArray(chunk?.choices) ? chunk.choices[0] : undefined;
  const delta = choice?.delta?.content ?? choice?.text ?? '';
  if (typeof delta === 'string') return delta;
  if (Array.isArray(delta)) return delta.map((x) => x?.text || x?.content || '').join('');
  return delta == null ? '' : String(delta);
}

interface StreamToolCallState {
  id: string;
  name: string;
  arguments: string;
  outputIndex: number;
  added: boolean;
}

function extractToolCallDeltas(chunk: any): any[] {
  const choice = Array.isArray(chunk?.choices) ? chunk.choices[0] : undefined;
  const calls = choice?.delta?.tool_calls ?? choice?.message?.tool_calls ?? [];
  return Array.isArray(calls) ? calls : [];
}

function responseToolCallItem(call: StreamToolCallState): any {
  const splitName = splitNamespacedToolName(call.name || 'unknown_function');
  if (isFreeformToolName(splitName.name)) {
    return {
      id: call.id,
      type: 'custom_tool_call',
      status: 'completed',
      call_id: call.id,
      ...splitName,
      input: unwrapFreeformArguments(call.arguments || ''),
    };
  }
  return {
    id: call.id,
    type: 'function_call',
    status: 'completed',
    call_id: call.id,
    ...splitName,
    arguments: call.arguments || '',
  };
}

function responseSnapshot(id: string, model: string, status: string, outputText = '', toolCalls: StreamToolCallState[] = []): any {
  const output: any[] = [];
  if (outputText) {
    output.push({
      id: `msg_${id}`,
      type: 'message',
      status: 'completed',
      role: 'assistant',
      content: [{ type: 'output_text', text: outputText, annotations: [] }],
    });
  }
  for (const call of toolCalls) {
    output.push(responseToolCallItem(call));
  }
  return {
    id,
    object: 'response',
    created_at: Math.floor(Date.now() / 1000),
    status,
    model,
    output,
    output_text: outputText,
  };
}

function parseChunkData(data: string): { chunk?: any; error?: { error: { message: string; type: string; code: string; status: number; detail?: unknown } } } {
  try {
    return { chunk: JSON.parse(data) };
  } catch (error) {
    return {
      error: makeStreamMalformedChunkError({ raw: data, cause: error instanceof Error ? error.message : String(error) }),
    };
  }
}

export function makeResponsesStream(upstreamBody: ReadableStream<Uint8Array>, model: string): ReadableStream<Uint8Array> {
  let buffer = '';
  let outputText = '';
  let textItemStarted = false;
  let streamStarted = false;
  const toolCalls = new Map<number, StreamToolCallState>();
  const reader = upstreamBody.getReader();
  const responseId = `resp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  const messageId = `msg_${responseId}`;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;

      function send(event: string, data: unknown) {
        controller.enqueue(encoder.encode(sse(event, data)));
      }

      function ensureTextItem() {
        if (textItemStarted) return;
        send('response.output_item.added', {
          type: 'response.output_item.added',
          output_index: 0,
          item: { id: messageId, type: 'message', status: 'in_progress', role: 'assistant', content: [] },
        });
        send('response.content_part.added', {
          type: 'response.content_part.added',
          item_id: messageId,
          output_index: 0,
          content_index: 0,
          part: { type: 'output_text', text: '', annotations: [] },
        });
        textItemStarted = true;
      }

      function ensureToolCall(index: number, delta: any): StreamToolCallState {
        let state = toolCalls.get(index);
        if (!state) {
          const id = delta?.id || `call_${responseId}_${index}`;
          state = { id, name: '', arguments: '', outputIndex: (textItemStarted || outputText) ? index + 1 : index, added: false };
          toolCalls.set(index, state);
        }
        if (typeof delta?.id === 'string' && !state.id) state.id = delta.id;
        const fn = delta?.function || {};
        if (typeof fn.name === 'string') state.name += fn.name;
        return state;
      }

      send('response.created', {
        type: 'response.created',
        response: responseSnapshot(responseId, model, 'in_progress'),
      });
      streamStarted = true;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() || '';
          for (const line of lines) {
            const data = parseDataLine(line.trim());
            if (!data) continue;
            if (data === '[DONE]') continue;
            const parsed = parseChunkData(data);
            if (parsed.error) {
              send('response.failed', {
                type: 'response.failed',
                response: responseSnapshot(responseId, model, 'failed', outputText, [...toolCalls.values()]),
                error: parsed.error.error,
              });
              closed = true;
              controller.close();
              return;
            }
            const chunk = parsed.chunk;

            for (const toolDelta of extractToolCallDeltas(chunk)) {
              const index = typeof toolDelta.index === 'number' ? toolDelta.index : 0;
              const state = ensureToolCall(index, toolDelta);
              const fn = toolDelta.function || {};
              const argsDelta = typeof fn.arguments === 'string' ? fn.arguments : '';
              if (!state.added) {
                send('response.output_item.added', {
                  type: 'response.output_item.added',
                  output_index: state.outputIndex,
                  item: {
                    id: state.id,
                    type: isFreeformToolName(state.name) ? 'custom_tool_call' : 'function_call',
                    status: 'in_progress',
                    call_id: state.id,
                    ...splitNamespacedToolName(state.name || 'unknown_function'),
                    ...(isFreeformToolName(state.name) ? { input: '' } : { arguments: '' }),
                  },
                });
                state.added = true;
              }
              if (argsDelta) {
                state.arguments += argsDelta;
                if (isFreeformToolName(state.name)) continue;
                send(isFreeformToolName(state.name) ? 'response.custom_tool_call_input.delta' : 'response.function_call_arguments.delta', {
                  type: isFreeformToolName(state.name) ? 'response.custom_tool_call_input.delta' : 'response.function_call_arguments.delta',
                  item_id: state.id,
                  output_index: state.outputIndex,
                  delta: argsDelta,
                });
              }
            }

            const delta = extractDelta(chunk);
            if (!delta) continue;
            ensureTextItem();
            outputText += delta;
            send('response.output_text.delta', {
              type: 'response.output_text.delta',
              item_id: messageId,
              output_index: 0,
              content_index: 0,
              delta,
            });
          }
        }
        if (textItemStarted) {
          send('response.output_text.done', {
            type: 'response.output_text.done',
            item_id: messageId,
            output_index: 0,
            content_index: 0,
            text: outputText,
          });
          send('response.content_part.done', {
            type: 'response.content_part.done',
            item_id: messageId,
            output_index: 0,
            content_index: 0,
            part: { type: 'output_text', text: outputText, annotations: [] },
          });
          send('response.output_item.done', {
            type: 'response.output_item.done',
            output_index: 0,
            item: {
              id: messageId,
              type: 'message',
              status: 'completed',
              role: 'assistant',
              content: [{ type: 'output_text', text: outputText, annotations: [] }],
            },
          });
        }
        for (const state of toolCalls.values()) {
          const item = responseToolCallItem(state);
          if (!isFreeformToolName(state.name)) {
            send('response.function_call_arguments.done', {
              type: 'response.function_call_arguments.done',
              item_id: state.id,
              output_index: state.outputIndex,
              arguments: item.arguments,
            });
          }
          send('response.output_item.done', {
            type: 'response.output_item.done',
            output_index: state.outputIndex,
            item,
          });
        }
        send('response.completed', {
          type: 'response.completed',
          response: responseSnapshot(responseId, model, 'completed', outputText, [...toolCalls.values()]),
        });
      } catch (error: any) {
        const mapped = error instanceof Error ? makeStreamInterruptedError(error) : makeGenericStreamFailure(error);
        send('response.failed', {
          type: 'response.failed',
          response: responseSnapshot(responseId, model, 'failed', outputText, [...toolCalls.values()]),
          error: mapped.error,
        });
      } finally {
        if (!closed) controller.close();
      }
    },
    cancel() {
      if (streamStarted) reader.cancel().catch(() => undefined);
    },
  });
}

export const internals = { extractDelta, extractToolCallDeltas, responseSnapshot, responseToolCallItem, parseChunkData };
