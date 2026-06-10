export interface TranslatorErrorBody {
  error: {
    message: string;
    type: string;
    code: string;
    status: number;
    detail?: unknown;
  };
}

export interface TranslatorHttpError {
  status: number;
  body: TranslatorErrorBody;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toMessage(value: unknown): string {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (isRecord(value)) {
    if (typeof value.message === 'string' && value.message.trim()) return value.message.trim();
    if (typeof value.error === 'string' && value.error.trim()) return value.error.trim();
  }
  return '';
}

export function statusToErrorType(status: number): string {
  if (status === 401) return 'authentication_error';
  if (status === 403) return 'permission_error';
  if (status === 404) return 'not_found_error';
  if (status === 408 || status === 504) return 'timeout_error';
  if (status === 429) return 'rate_limit_error';
  if (status >= 500) return 'upstream_error';
  return 'invalid_request_error';
}

export function statusToErrorCode(status: number): string {
  if (status === 400) return 'bad_request';
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 408) return 'request_timeout';
  if (status === 429) return 'rate_limit_exceeded';
  if (status === 502) return 'bad_gateway';
  if (status === 503) return 'service_unavailable';
  if (status === 504) return 'upstream_timeout';
  if (status >= 500) return 'upstream_error';
  return 'invalid_request';
}

export function makeTranslatorError(status: number, message: string, detail?: unknown, code = statusToErrorCode(status)): TranslatorHttpError {
  return {
    status,
    body: {
      error: {
        message,
        type: statusToErrorType(status),
        code,
        status,
        ...(detail === undefined ? {} : { detail }),
      },
    },
  };
}

export function makeInvalidJsonError(error: unknown): TranslatorHttpError {
  return makeTranslatorError(400, 'Request body must be valid JSON.', { cause: toMessage(error) || String(error) }, 'invalid_json');
}

export function makeUpstreamExceptionError(error: unknown): TranslatorHttpError {
  const name = isRecord(error) && typeof error.name === 'string' ? error.name : '';
  const message = toMessage(error) || String(error);
  if (name === 'AbortError') {
    return makeTranslatorError(504, 'Upstream request timed out.', { cause: message }, 'upstream_timeout');
  }
  return makeTranslatorError(502, 'Unable to reach upstream chat completions service.', { cause: message }, 'upstream_connection_error');
}

function parseMaybeJson(text: string): unknown {
  if (!text.trim()) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function extractUpstreamError(parsed: unknown, fallback: string): { message: string; detail?: unknown } {
  if (isRecord(parsed)) {
    const rawError = parsed.error;
    if (isRecord(rawError)) {
      return {
        message: toMessage(rawError) || fallback,
        detail: {
          upstream_type: typeof rawError.type === 'string' ? rawError.type : undefined,
          upstream_code: typeof rawError.code === 'string' ? rawError.code : undefined,
        },
      };
    }
    const message = toMessage(parsed);
    if (message) return { message };
  }
  return { message: fallback };
}

export function makeUpstreamStatusError(status: number, bodyText: string): TranslatorHttpError {
  const fallback = `Upstream returned HTTP ${status}.`;
  const parsed = parseMaybeJson(bodyText);
  const extracted = extractUpstreamError(parsed, fallback);
  return makeTranslatorError(status, extracted.message, extracted.detail, statusToErrorCode(status));
}

export function makeInvalidUpstreamJsonError(error: unknown): TranslatorHttpError {
  return makeTranslatorError(502, 'Upstream returned invalid JSON.', { cause: toMessage(error) || String(error) }, 'upstream_invalid_json');
}
