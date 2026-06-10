import http from 'node:http';
import { config } from './config.ts';
import { responsesToChat } from './translators/responses-to-chat.ts';
import { chatToResponses } from './translators/chat-to-responses.ts';
import { makeResponsesStream } from './translators/stream-events.ts';
import { callChatCompletions, fetchModels } from './upstream/openai-compatible.ts';

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

function sendError(res: http.ServerResponse, status: number, message: string, detail?: unknown): void {
  sendJson(res, status, {
    error: {
      message,
      type: 'translator_error',
      detail,
    },
  });
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
  const body = await readJson(req);
  const upstream = await callChatCompletions(body);
  const contentType = upstream.headers.get('content-type') || 'application/json';
  res.writeHead(upstream.status, { 'content-type': contentType });
  if (upstream.body) await pipeWebStreamToNode(upstream.body, res);
  else res.end();
}

async function handleResponses(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const responsesRequest = await readJson(req);
  const chatRequest = responsesToChat(responsesRequest);
  const upstream = await callChatCompletions(chatRequest);
  const textEventStream = (upstream.headers.get('content-type') || '').includes('text/event-stream');

  if (!upstream.ok) {
    const bodyText = await upstream.text().catch(() => '');
    res.writeHead(upstream.status, { 'content-type': upstream.headers.get('content-type') || 'application/json' });
    res.end(bodyText || JSON.stringify({ error: { message: `upstream returned ${upstream.status}` } }));
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

  const chatResponse = await upstream.json();
  sendJson(res, 200, chatToResponses(chatResponse, chatRequest.model));
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
