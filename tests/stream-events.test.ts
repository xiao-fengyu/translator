import test from 'node:test';
import assert from 'node:assert/strict';
import { makeResponsesStream } from '../src/translators/stream-events.ts';

function makeUpstreamSSE(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

function makeFailingStream(message: string, name = 'Error'): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"hello"}}]}\n\n'));
      const error = new Error(message);
      error.name = name;
      controller.error(error);
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

test('makeResponsesStream emits namespace for flattened mcp tool calls', async () => {
  const upstream = makeUpstreamSSE([
    'data: {"id":"chatcmpl_1","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_mcp","type":"function","function":{"name":"mcp__memory__read_graph","arguments":""}}]}}]}\n\n',
    'data: {"id":"chatcmpl_1","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{}"}}]}}]}\n\n',
    'data: {"id":"chatcmpl_1","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}\n\n',
    'data: [DONE]\n\n',
  ]);

  const out = await collectStream(makeResponsesStream(upstream, 'm'));

  assert.match(out, /"namespace":"mcp__memory"/);
  assert.match(out, /"name":"read_graph"/);
  assert.match(out, /"call_id":"call_mcp"/);
});

test('makeResponsesStream emits structured failed event for malformed upstream JSON', async () => {
  const upstream = makeUpstreamSSE([
    'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
    'data: {bad json}\n\n',
  ]);

  const out = await collectStream(makeResponsesStream(upstream, 'm'));

  assert.match(out, /event: response\.failed/);
  assert.match(out, /"code":"upstream_invalid_stream_json"/);
  assert.match(out, /"type":"upstream_error"/);
  assert.match(out, /"status":502/);
});

test('makeResponsesStream emits structured failed event for interrupted upstream stream', async () => {
  const out = await collectStream(makeResponsesStream(makeFailingStream('socket hang up'), 'm'));

  assert.match(out, /event: response\.failed/);
  assert.match(out, /"code":"upstream_stream_interrupted"/);
  assert.match(out, /"message":"Upstream stream terminated unexpectedly\./);
  assert.match(out, /"cause":"socket hang up"/);
});

test('makeResponsesStream emits timeout-specific failed event for aborted upstream stream', async () => {
  const out = await collectStream(makeResponsesStream(makeFailingStream('deadline exceeded', 'AbortError'), 'm'));

  assert.match(out, /event: response\.failed/);
  assert.match(out, /"code":"upstream_stream_timeout"/);
  assert.match(out, /"type":"timeout_error"/);
  assert.match(out, /"status":504/);
});
