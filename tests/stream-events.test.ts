import test from 'node:test';
import assert from 'node:assert/strict';
import { makeResponsesStream } from '../src/translators/stream-events.ts';

function makeUpstreamSSE(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

async function collectStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let out = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
  }
  out += decoder.decode();
  return out;
}

test('makeResponsesStream emits tool_call events for streamed tool_calls deltas', async () => {
  const upstream = makeUpstreamSSE([
    'data: {"id":"chatcmpl_1","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_abc","type":"function","function":{"name":"shell","arguments":""}}]}}]}\n\n',
    'data: {"id":"chatcmpl_1","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"cmd\\":"}}]}}]}\n\n',
    'data: {"id":"chatcmpl_1","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"pwd\\"}"}}]}}]}\n\n',
    'data: {"id":"chatcmpl_1","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}\n\n',
    'data: [DONE]\n\n',
  ]);

  const out = await collectStream(makeResponsesStream(upstream, 'm'));

  assert.match(out, /event: response\.created/);
  assert.match(out, /event: response\.output_item\.added/);
  assert.match(out, /event: response\.function_call_arguments\.delta/);
  assert.match(out, /event: response\.function_call_arguments\.done/);
  assert.match(out, /event: response\.completed/);

  assert.match(out, /"name":"shell"/);
  assert.match(out, /"call_id":"call_abc"/);
  assert.match(out, /"arguments":"\{\\"cmd\\":\\"pwd\\"\}"/);
});
