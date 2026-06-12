import test from 'node:test';
import assert from 'node:assert/strict';
import { callChatCompletions } from '../src/upstream/openai-compatible.ts';

function jsonResponse(status: number, body = { ok: true }): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('callChatCompletions retries transient upstream status codes before returning success', async () => {
  const originalFetch = globalThis.fetch;
  const calls: RequestInfo[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    calls.push(input as RequestInfo);
    if (calls.length === 1) return jsonResponse(503, { error: { message: 'temporary unavailable' } });
    return jsonResponse(200, { id: 'ok' });
  }) as typeof fetch;

  try {
    const response = await callChatCompletions({ model: 'gpt-5.5', messages: [] });
    assert.equal(response.status, 200);
    assert.equal(calls.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('callChatCompletions does not retry non-transient upstream errors', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return jsonResponse(400, { error: { message: 'bad request' } });
  }) as typeof fetch;

  try {
    const response = await callChatCompletions({ model: 'gpt-5.5', messages: [] });
    assert.equal(response.status, 400);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('callChatCompletions retries transient fetch exceptions', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    if (calls === 1) throw new TypeError('fetch failed');
    return jsonResponse(200, { id: 'ok' });
  }) as typeof fetch;

  try {
    const response = await callChatCompletions({ model: 'gpt-5.5', messages: [] });
    assert.equal(response.status, 200);
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
