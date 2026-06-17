import test from 'node:test';
import assert from 'node:assert/strict';
import { chatToResponses, extractChatText, extractChatToolCalls } from '../src/translators/chat-to-responses.ts';

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

test('extracts chat tool calls', () => {
  const calls = extractChatToolCalls({ choices: [{ message: { tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'shell', arguments: '{}' } }] } }] });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].function.name, 'shell');
});

test('wraps chat tool calls as responses function_call output', () => {
  const result = chatToResponses({
    id: 'chat_tool_1',
    model: 'm',
    choices: [{
      message: {
        content: null,
        tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'shell', arguments: '{"cmd":"pwd"}' } }],
      },
    }],
    usage: { total_tokens: 9 },
  }, 'm');
  assert.equal(result.output_text, '');
  assert.equal(result.output.length, 1);
  assert.deepEqual(result.output[0], {
    id: 'call_1',
    type: 'function_call',
    status: 'completed',
    call_id: 'call_1',
    name: 'shell',
    arguments: '{"cmd":"pwd"}',
  });
});

test('maps apply_patch chat function input to custom tool call for Codex router', () => {
  const patch = '*** Begin Patch\n*** Add File: x.txt\n+hi\n*** End Patch';
  const wrapped = JSON.stringify({ input: patch });
  const result = chatToResponses({
    id: 'chat_patch_1',
    model: 'm',
    choices: [{
      message: {
        content: null,
        tool_calls: [{ id: 'call_patch', type: 'function', function: { name: 'apply_patch', arguments: wrapped } }],
      },
    }],
  }, 'm');
  assert.deepEqual(result.output[0], {
    id: 'call_patch',
    type: 'custom_tool_call',
    status: 'completed',
    call_id: 'call_patch',
    name: 'apply_patch',
    input: patch,
  });
});

test('wraps flattened mcp tool calls with responses namespace', () => {
  const result = chatToResponses({
    id: 'chat_mcp_1',
    model: 'm',
    choices: [{
      message: {
        content: null,
        tool_calls: [{ id: 'call_mcp_1', type: 'function', function: { name: 'mcp__memory__read_graph', arguments: '{}' } }],
      },
    }],
  }, 'm');
  assert.deepEqual(result.output[0], {
    id: 'call_mcp_1',
    type: 'function_call',
    status: 'completed',
    call_id: 'call_mcp_1',
    namespace: 'mcp__memory',
    name: 'read_graph',
    arguments: '{}',
  });
});

test('normalizes filesystem resource reads with file uri to filesystem text reads', () => {
  const result = chatToResponses({
    id: 'chat_mcp_file_1',
    model: 'm',
    choices: [{
      message: {
        content: null,
        tool_calls: [{
          id: 'call_mcp_file_1',
          type: 'function',
          function: {
            name: 'read_mcp_resource',
            arguments: JSON.stringify({
              server: 'filesystem',
              uri: 'file:///data/e-platform/test-reports/runs/script-checks.json',
            }),
          },
        }],
      },
    }],
  }, 'm');
  assert.deepEqual(result.output[0], {
    id: 'call_mcp_file_1',
    type: 'function_call',
    status: 'completed',
    call_id: 'call_mcp_file_1',
    namespace: 'mcp__filesystem',
    name: 'read_text_file',
    arguments: JSON.stringify({ path: '/data/e-platform/test-reports/runs/script-checks.json' }),
  });
});

test('wraps chat response with both content and tool_calls as message + function_call', () => {
  const result = chatToResponses({
    id: 'chat_mixed_1',
    model: 'm',
    choices: [{
      message: {
        content: 'thinking before calling',
        tool_calls: [{ id: 'call_2', type: 'function', function: { name: 'shell', arguments: '{"cmd":"ls"}' } }],
      },
    }],
    usage: { total_tokens: 12 },
  }, 'm');
  assert.equal(result.output_text, 'thinking before calling');
  assert.equal(result.output.length, 2);
  assert.equal(result.output[0].type, 'message');
  assert.equal(result.output[0].role, 'assistant');
  assert.equal(result.output[0].content[0].type, 'output_text');
  assert.equal(result.output[0].content[0].text, 'thinking before calling');
  assert.deepEqual(result.output[1], {
    id: 'call_2',
    type: 'function_call',
    status: 'completed',
    call_id: 'call_2',
    name: 'shell',
    arguments: '{"cmd":"ls"}',
  });
});
