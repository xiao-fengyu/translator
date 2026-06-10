import test from 'node:test';
import assert from 'node:assert/strict';
import {
  makeInvalidJsonError,
  makeInvalidUpstreamJsonError,
  makeUpstreamExceptionError,
  makeUpstreamStatusError,
  statusToErrorCode,
  statusToErrorType,
} from '../src/errors.ts';

test('maps common upstream statuses to stable error type and code', () => {
  assert.equal(statusToErrorType(401), 'authentication_error');
  assert.equal(statusToErrorCode(401), 'unauthorized');
  assert.equal(statusToErrorType(429), 'rate_limit_error');
  assert.equal(statusToErrorCode(429), 'rate_limit_exceeded');
  assert.equal(statusToErrorType(500), 'upstream_error');
  assert.equal(statusToErrorCode(500), 'upstream_error');
});

test('wraps upstream JSON error body without leaking raw response shape', () => {
  const wrapped = makeUpstreamStatusError(429, JSON.stringify({
    error: {
      message: 'Too Many Requests',
      type: 'rate_limit_error',
      code: 'rate_limit_exceeded',
    },
  }));

  assert.equal(wrapped.status, 429);
  assert.equal(wrapped.body.error.message, 'Too Many Requests');
  assert.equal(wrapped.body.error.type, 'rate_limit_error');
  assert.equal(wrapped.body.error.code, 'rate_limit_exceeded');
  assert.deepEqual(wrapped.body.error.detail, {
    upstream_type: 'rate_limit_error',
    upstream_code: 'rate_limit_exceeded',
  });
});

test('wraps upstream non-json status body with fallback message', () => {
  const wrapped = makeUpstreamStatusError(503, '<html>maintenance</html>');

  assert.equal(wrapped.status, 503);
  assert.equal(wrapped.body.error.message, 'Upstream returned HTTP 503.');
  assert.equal(wrapped.body.error.type, 'upstream_error');
  assert.equal(wrapped.body.error.code, 'service_unavailable');
});

test('wraps timeout and connection exceptions', () => {
  const timeout = makeUpstreamExceptionError(Object.assign(new Error('This operation was aborted'), { name: 'AbortError' }));
  assert.equal(timeout.status, 504);
  assert.equal(timeout.body.error.type, 'timeout_error');
  assert.equal(timeout.body.error.code, 'upstream_timeout');

  const connection = makeUpstreamExceptionError(new TypeError('fetch failed'));
  assert.equal(connection.status, 502);
  assert.equal(connection.body.error.type, 'upstream_error');
  assert.equal(connection.body.error.code, 'upstream_connection_error');
});

test('wraps invalid request and upstream JSON errors', () => {
  const request = makeInvalidJsonError(new SyntaxError('Unexpected token }'));
  assert.equal(request.status, 400);
  assert.equal(request.body.error.type, 'invalid_request_error');
  assert.equal(request.body.error.code, 'invalid_json');

  const upstream = makeInvalidUpstreamJsonError(new SyntaxError('Unexpected end of JSON input'));
  assert.equal(upstream.status, 502);
  assert.equal(upstream.body.error.type, 'upstream_error');
  assert.equal(upstream.body.error.code, 'upstream_invalid_json');
});
