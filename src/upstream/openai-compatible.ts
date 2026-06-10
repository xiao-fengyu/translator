import { config } from '../config.ts';

export async function callChatCompletions(body: unknown): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.upstreamTimeoutMs);
  try {
    return await fetch(`${config.upstreamBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${config.upstreamApiKey}`,
        'content-type': 'application/json',
        'accept': 'application/json, text/event-stream',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchModels(): Promise<Response> {
  return fetch(`${config.upstreamBaseUrl}/models`, {
    headers: {
      'authorization': `Bearer ${config.upstreamApiKey}`,
      'accept': 'application/json',
    },
  });
}
