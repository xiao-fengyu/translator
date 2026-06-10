import { makeTranslatorError, type TranslatorHttpError } from '../errors.ts';

export interface StreamFailurePayload {
  error: TranslatorHttpError['body']['error'];
}

export function makeStreamMalformedChunkError(detail?: unknown): StreamFailurePayload {
  return makeTranslatorError(502, 'Upstream stream emitted invalid JSON event.', detail, 'upstream_invalid_stream_json').body;
}

export function makeStreamInterruptedError(error: unknown): StreamFailurePayload {
  const name = error && typeof error === 'object' && 'name' in error && typeof (error as any).name === 'string'
    ? (error as any).name
    : '';
  const message = error instanceof Error ? error.message : String(error);
  if (name === 'AbortError') {
    return makeTranslatorError(504, 'Upstream stream timed out.', { cause: message }, 'upstream_stream_timeout').body;
  }
  return makeTranslatorError(502, 'Upstream stream terminated unexpectedly.', { cause: message }, 'upstream_stream_interrupted').body;
}

export function makeGenericStreamFailure(error: unknown): StreamFailurePayload {
  const message = error instanceof Error ? error.message : String(error);
  return makeTranslatorError(502, 'Translator failed while processing upstream stream.', { cause: message }, 'upstream_stream_processing_failed').body;
}
