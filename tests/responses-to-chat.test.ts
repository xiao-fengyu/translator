import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TEST_DATA_DIR = join(tmpdir(), `translator-store-test-${Date.now()}`);
mkdirSync(TEST_DATA_DIR, { recursive: true });
process.env.STORE_DATA_DIR = TEST_DATA_DIR;
process.env.UPSTREAM_BASE_URL = process.env.UPSTREAM_BASE_URL || 'http://127.0.0.1:3000/v1';
process.env.UPSTREAM_API_KEY = process.env.UPSTREAM_API_KEY || 'test-key';
process.env.DEFAULT_MODEL = process.env.DEFAULT_MODEL || 'claude-opus-4-7';

const { responsesToChat } = await import('../src/translators/responses-to-chat.ts');
const { saveResponseContext, clearResponseContexts, _resetMemoryOnly } = await import('../src/response-context-store.ts');

test('converts string input and instructions to chat messages', () => {
  clearResponseContexts();
  const result = responsesToChat({
    model: 'claude-opus-4-7',
    instructions: 'You are concise.',
    input: 'Say pong.',
  });
  assert.equal(result.model, 'claude-opus-4-7');
  assert.deepEqual(result.messages, [
    { role: 'system', content: 'You are concise.' },
    { role: 'user', content: 'Say pong.' },
  ]);
});

test('converts responses message item content array', () => {
  clearResponseContexts();
  const result = responsesToChat({
    model: 'm',
    input: [
      { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'hello' }] },
      { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'hi' }] },
    ],
  });
  assert.deepEqual(result.messages, [
    { role: 'user', content: 'hello' },
    { role: 'assistant', content: 'hi' },
  ]);
});

test('maps max_output_tokens to max_tokens', () => {
  clearResponseContexts();
  const result = responsesToChat({ model: 'm', input: 'x', max_output_tokens: 123, stream: true });
  assert.equal(result.max_tokens, 123);
  assert.equal(result.stream, true);
});

test('maps responses function tools to chat tools', () => {
  clearResponseContexts();
  const result = responsesToChat({
    model: 'm',
    input: 'use a tool',
    tools: [
      { type: 'function', name: 'shell', description: 'Run shell', parameters: { type: 'object' } },
    ],
    tool_choice: { type: 'function', name: 'shell' },
    parallel_tool_calls: false,
  });
  assert.deepEqual(result.tools, [
    { type: 'function', function: { name: 'shell', description: 'Run shell', parameters: { type: 'object' } } },
  ]);
  assert.deepEqual(result.tool_choice, { type: 'function', function: { name: 'shell' } });
  assert.equal(result.parallel_tool_calls, false);
});

test('maps responses function call history and output to chat messages', () => {
  clearResponseContexts();
  const result = responsesToChat({
    model: 'm',
    input: [
      { type: 'function_call', call_id: 'call_1', name: 'shell', arguments: '{"cmd":"pwd"}' },
      { type: 'function_call_output', call_id: 'call_1', output: '/data/translator' },
    ],
  });
  assert.deepEqual(result.messages, [
    {
      role: 'assistant',
      content: null,
      tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'shell', arguments: '{"cmd":"pwd"}' } }],
    },
    { role: 'tool', tool_call_id: 'call_1', content: '/data/translator' },
  ]);
});

test('reuses previous_response_id context when available', () => {
  clearResponseContexts();
  saveResponseContext('resp_prev_1', [
    { role: 'user', content: 'first question' },
    { role: 'assistant', content: 'first answer' },
  ]);
  const result = responsesToChat({
    model: 'm',
    previous_response_id: 'resp_prev_1',
    input: 'follow up',
  });
  assert.deepEqual(result.messages, [
    { role: 'user', content: 'first question' },
    { role: 'assistant', content: 'first answer' },
    { role: 'user', content: 'follow up' },
  ]);
});

test('ignores previous_response_id when no context exists', () => {
  clearResponseContexts();
  const result = responsesToChat({
    model: 'm',
    previous_response_id: 'missing_resp',
    input: 'fresh input',
  });
  assert.deepEqual(result.messages, [
    { role: 'user', content: 'fresh input' },
  ]);
});

test('persists context to disk and survives in-memory reset (simulated restart)', () => {
  clearResponseContexts();
  saveResponseContext('resp_disk_1', [
    { role: 'user', content: 'saved before restart' },
    { role: 'assistant', content: 'saved response' },
  ]);

  // Simulate process restart: clear in-memory map but keep disk file
  _resetMemoryOnly();

  const result = responsesToChat({
    model: 'm',
    previous_response_id: 'resp_disk_1',
    input: 'after restart',
  });

  assert.deepEqual(result.messages, [
    { role: 'user', content: 'saved before restart' },
    { role: 'assistant', content: 'saved response' },
    { role: 'user', content: 'after restart' },
  ]);

  // Cleanup test data
  clearResponseContexts();
});
