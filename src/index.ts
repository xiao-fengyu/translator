import http from 'node:http';
import { config } from './config.ts';
import { responsesToChat } from './translators/responses-to-chat.ts';
import { chatToResponses } from './translators/chat-to-responses.ts';
import { makeResponsesStream } from './translators/stream-events.ts';
import { toCompactResponse } from './translators/compact-response.ts';
import { saveResponseContext } from './response-context-store.ts';
import { callChatCompletions, fetchModels } from './upstream/openai-compatible.ts';
import {
  makeInvalidJsonError,
  makeInvalidUpstreamJsonError,
  makeTranslatorError,
  makeUpstreamExceptionError,
  makeUpstreamStatusError,
  type TranslatorHttpError,
} from './errors.ts';

async function readJson(req: http.IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text.trim()) return {};
  return JSON.parse(text);
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function sendTranslatorError(res: http.ServerResponse, error: TranslatorHttpError): void {
  sendJson(res, error.status, error.body);
}

function sendError(res: http.ServerResponse, status: number, message: string, detail?: unknown): void {
  sendTranslatorError(res, makeTranslatorError(status, message, detail));
}

async function pipeWebStreamToNode(webStream: ReadableStream<Uint8Array>, res: http.ServerResponse): Promise<void> {
  const reader = webStream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
  } finally {
    res.end();
  }
}

async function handleModels(res: http.ServerResponse): Promise<void> {
  try {
    const upstream = await fetchModels();
    if (upstream.ok) {
      const json = await upstream.json();
      sendJson(res, 200, json);
      return;
    }
  } catch {
    // Fall back to configured models below.
  }
  sendJson(res, 200, {
    object: 'list',
    data: config.models.map((id) => ({ id, object: 'model', created: 0, owned_by: 'translator' })),
  });
}

async function handleChatProxy(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  let body: unknown;
  try {
    body = await readJson(req);
  } catch (error) {
    sendTranslatorError(res, makeInvalidJsonError(error));
    return;
  }

  let upstream: Response;
  try {
    upstream = await callChatCompletions(body);
  } catch (error) {
    sendTranslatorError(res, makeUpstreamExceptionError(error));
    return;
  }

  const contentType = upstream.headers.get('content-type') || 'application/json';
  res.writeHead(upstream.status, { 'content-type': contentType });
  if (upstream.body) await pipeWebStreamToNode(upstream.body, res);
  else res.end();
}

async function handleResponsesRequest(req: http.IncomingMessage, res: http.ServerResponse, compact = false): Promise<void> {
  let responsesRequest: unknown;
  try {
    responsesRequest = await readJson(req);
  } catch (error) {
    sendTranslatorError(res, makeInvalidJsonError(error));
    return;
  }

  const chatRequest = responsesToChat(responsesRequest as any);
  let upstream: Response;
  try {
    upstream = await callChatCompletions(chatRequest);
  } catch (error) {
    sendTranslatorError(res, makeUpstreamExceptionError(error));
    return;
  }
  const textEventStream = (upstream.headers.get('content-type') || '').includes('text/event-stream');

  if (!upstream.ok) {
    const bodyText = await upstream.text().catch(() => '');
    sendTranslatorError(res, makeUpstreamStatusError(upstream.status, bodyText));
    return;
  }

  if (chatRequest.stream || textEventStream) {
    if (!upstream.body) {
      sendError(res, 502, 'upstream stream response has no body');
      return;
    }
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      'connection': 'keep-alive',
    });
    const translated = makeResponsesStream(upstream.body, chatRequest.model);
    await pipeWebStreamToNode(translated, res);
    return;
  }

  let chatResponse: unknown;
  try {
    chatResponse = await upstream.json();
  } catch (error) {
    sendTranslatorError(res, makeInvalidUpstreamJsonError(error));
    return;
  }

  const response = chatToResponses(chatResponse, chatRequest.model);
  saveResponseContext(response.id, chatRequest.messages);
  sendJson(res, 200, compact ? toCompactResponse(response) : response);
}

async function handleResponses(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  await handleResponsesRequest(req, res, false);
}

async function handleResponsesCompact(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  await handleResponsesRequest(req, res, true);
}

async function router(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' && url.pathname === '/healthz') {
    sendJson(res, 200, { ok: true, service: 'codex-responses-translator', version: '0.1.0' });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/v1/models') {
    await handleModels(res);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/v1/chat/completions') {
    await handleChatProxy(req, res);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/v1/responses') {
    await handleResponses(req, res);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/v1/responses/compact') {
    await handleResponsesCompact(req, res);
    return;
  }

  sendError(res, 404, `No route for ${req.method} ${url.pathname}`);
}

const server = http.createServer((req, res) => {
  router(req, res).catch((error) => {
    sendError(res, 500, error?.message || String(error));
  });
});

server.listen(config.port, config.host, () => {
  console.log(`translator listening on http://${config.host}:${config.port}`);
  console.log(`upstream chat completions: ${config.upstreamBaseUrl}/chat/completions`);
});
