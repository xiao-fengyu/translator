import { TextDecoder, TextEncoder } from 'node:util';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function parseDataLine(line: string): string | null {
  if (!line.startsWith('data:')) return null;
  return line.slice(5).trimStart();
}

function extractDelta(chunk: any): string {
  const choice = Array.isArray(chunk?.choices) ? chunk.choices[0] : undefined;
  const delta = choice?.delta?.content ?? choice?.text ?? '';
  if (typeof delta === 'string') return delta;
  if (Array.isArray(delta)) return delta.map((x) => x?.text || x?.content || '').join('');
  return delta == null ? '' : String(delta);
}

function responseSnapshot(id: string, model: string, status: string, outputText = ''): any {
  return {
    id,
    object: 'response',
    created_at: Math.floor(Date.now() / 1000),
    status,
    model,
    output: outputText
      ? [
          {
            id: `msg_${id}`,
            type: 'message',
            status: 'completed',
            role: 'assistant',
            content: [{ type: 'output_text', text: outputText, annotations: [] }],
          },
        ]
      : [],
    output_text: outputText,
  };
}

export function makeResponsesStream(upstreamBody: ReadableStream<Uint8Array>, model: string): ReadableStream<Uint8Array> {
  let buffer = '';
  let outputText = '';
  let started = false;
  const reader = upstreamBody.getReader();
  const responseId = `resp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  const messageId = `msg_${responseId}`;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      function send(event: string, data: unknown) {
        controller.enqueue(encoder.encode(sse(event, data)));
      }

      send('response.created', {
        type: 'response.created',
        response: responseSnapshot(responseId, model, 'in_progress'),
      });
      send('response.output_item.added', {
        type: 'response.output_item.added',
        output_index: 0,
        item: { id: messageId, type: 'message', status: 'in_progress', role: 'assistant', content: [] },
      });
      send('response.content_part.added', {
        type: 'response.content_part.added',
        item_id: messageId,
        output_index: 0,
        content_index: 0,
        part: { type: 'output_text', text: '', annotations: [] },
      });
      started = true;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() || '';
          for (const line of lines) {
            const data = parseDataLine(line.trim());
            if (!data) continue;
            if (data === '[DONE]') continue;
            let chunk: any;
            try { chunk = JSON.parse(data); } catch { continue; }
            const delta = extractDelta(chunk);
            if (!delta) continue;
            outputText += delta;
            send('response.output_text.delta', {
              type: 'response.output_text.delta',
              item_id: messageId,
              output_index: 0,
              content_index: 0,
              delta,
            });
          }
        }
        send('response.output_text.done', {
          type: 'response.output_text.done',
          item_id: messageId,
          output_index: 0,
          content_index: 0,
          text: outputText,
        });
        send('response.content_part.done', {
          type: 'response.content_part.done',
          item_id: messageId,
          output_index: 0,
          content_index: 0,
          part: { type: 'output_text', text: outputText, annotations: [] },
        });
        send('response.output_item.done', {
          type: 'response.output_item.done',
          output_index: 0,
          item: {
            id: messageId,
            type: 'message',
            status: 'completed',
            role: 'assistant',
            content: [{ type: 'output_text', text: outputText, annotations: [] }],
          },
        });
        send('response.completed', {
          type: 'response.completed',
          response: responseSnapshot(responseId, model, 'completed', outputText),
        });
      } catch (error: any) {
        send('response.failed', {
          type: 'response.failed',
          response: responseSnapshot(responseId, model, 'failed', outputText),
          error: { message: error?.message || String(error) },
        });
      } finally {
        controller.close();
      }
    },
    cancel() {
      if (started) reader.cancel().catch(() => undefined);
    },
  });
}
