import test from 'node:test';
import assert from 'node:assert/strict';
import { toCompactResponse } from '../src/translators/compact-response.ts';

test('toCompactResponse keeps only compact response fields', () => {
  const compact = toCompactResponse({
    id: 'resp_1',
    object: 'response',
    created_at: 123,
    status: 'completed',
    model: 'claude-opus-4-7',
    output_text: 'pong',
    usage: { total_tokens: 9 },
    output: [{ type: 'message' }],
    extra: 'ignored',
  });

  assert.deepEqual(compact, {
    id: 'resp_1',
    object: 'response',
    created_at: 123,
    status: 'completed',
    model: 'claude-opus-4-7',
    output_text: 'pong',
    usage: { total_tokens: 9 },
  });
});

test('toCompactResponse falls back to stable defaults', () => {
  const nowBefore = Math.floor(Date.now() / 1000);
  const compact = toCompactResponse({});
  const nowAfter = Math.floor(Date.now() / 1000);

  assert.equal(compact.object, 'response');
  assert.equal(compact.status, 'completed');
  assert.equal(compact.model, '');
  assert.equal(compact.output_text, '');
  assert.equal(compact.usage, null);
  assert.ok(compact.created_at >= nowBefore && compact.created_at <= nowAfter);
});
