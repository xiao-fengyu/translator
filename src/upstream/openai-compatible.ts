import { config } from '../config.ts';

const RETRYABLE_STATUS_CODES = new Set([429, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelayMs(attempt: number): number {
  return config.upstreamRetryBaseDelayMs * Math.max(1, attempt * attempt);
}

function isRetryableException(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const name = 'name' in error && typeof error.name === 'string' ? error.name : '';
  return name === 'AbortError' || error instanceof TypeError;
}

async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= config.upstreamRetries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.upstreamTimeoutMs);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      if (!RETRYABLE_STATUS_CODES.has(response.status) || attempt >= config.upstreamRetries) return response;

      await response.body?.cancel().catch(() => undefined);
      await sleep(retryDelayMs(attempt + 1));
    } catch (error) {
      lastError = error;
      if (!isRetryableException(error) || attempt >= config.upstreamRetries) throw error;
      await sleep(retryDelayMs(attempt + 1));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

export async function callChatCompletions(body: unknown): Promise<Response> {
  return fetchWithRetry(`${config.upstreamBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${config.upstreamApiKey}`,
      'content-type': 'application/json',
      'accept': 'application/json, text/event-stream',
    },
    body: JSON.stringify(body),
  });
}

export async function fetchModels(): Promise<Response> {
  return fetchWithRetry(`${config.upstreamBaseUrl}/models`, {
    headers: {
      'authorization': `Bearer ${config.upstreamApiKey}`,
      'accept': 'application/json',
    },
  });
}
