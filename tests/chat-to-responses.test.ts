import test from 'node:test';
import assert from 'node:assert/strict';
import { chatToResponses, extractChatText } from '../src/translators/chat-to-responses.ts';

test('extracts chat completion text', () => {
  assert.equal(extractChatText({ choices: [{ message: { content: 'pong' } }] }), 'pong');
});

test('wraps chat response as responses-like object', () => {
  const result = chatToResponses({ id: 'chat_1', model: 'm', choices: [{ message: { content: 'pong' } }], usage: { total_tokens: 2 } }, 'm');
  assert.equal(result.id, 'chat_1');
  assert.equal(result.object, 'response');
  assert.equal(result.status, 'completed');
  assert.equal(result.output_text, 'pong');
  assert.equal(result.output[0].content[0].text, 'pong');
  assert.deepEqual(result.usage, { total_tokens: 2 });
});
