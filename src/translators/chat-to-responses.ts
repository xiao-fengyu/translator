function responseId(): string {
  return `resp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function extractChatText(chatResponse: any): string {
  const choices = Array.isArray(chatResponse?.choices) ? chatResponse.choices : [];
  const first = choices[0] || {};
  const content = first.message?.content ?? first.delta?.content ?? '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((item) => typeof item === 'string' ? item : item?.text || item?.content || '').join('');
  }
  return content == null ? '' : String(content);
}

export function chatToResponses(chatResponse: any, model: string): any {
  const text = extractChatText(chatResponse);
  const id = chatResponse?.id || responseId();
  return {
    id,
    object: 'response',
    created_at: Math.floor(Date.now() / 1000),
    status: 'completed',
    model: chatResponse?.model || model,
    output: [
      {
        id: `msg_${id}`,
        type: 'message',
        status: 'completed',
        role: 'assistant',
        content: [
          {
            type: 'output_text',
            text,
            annotations: [],
          },
        ],
      },
    ],
    output_text: text,
    usage: chatResponse?.usage || null,
  };
}
