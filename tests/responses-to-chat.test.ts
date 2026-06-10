import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTREAM_BASE_URL = process.env.UPSTREAM_BASE_URL || 'http://127.0.0.1:3000/v1';
process.env.UPSTREAM_API_KEY = process.env.UPSTREAM_API_KEY || 'test-key';
process.env.DEFAULT_MODEL = process.env.DEFAULT_MODEL || 'claude-opus-4-7';

const { responsesToChat } = await import('../src/translators/responses-to-chat.ts');

test('converts string input and instructions to chat messages', () => {
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
  const result = responsesToChat({ model: 'm', input: 'x', max_output_tokens: 123, stream: true });
  assert.equal(result.max_tokens, 123);
  assert.equal(result.stream, true);
});

test('maps responses function tools to chat tools', () => {
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
