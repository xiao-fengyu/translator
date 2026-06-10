export interface CompactResponse {
  id: string;
  object: 'response';
  created_at: number;
  status: string;
  model: string;
  output_text: string;
  usage: unknown;
}

export function toCompactResponse(response: any): CompactResponse {
  return {
    id: String(response?.id || ''),
    object: 'response',
    created_at: Number(response?.created_at || Math.floor(Date.now() / 1000)),
    status: typeof response?.status === 'string' ? response.status : 'completed',
    model: typeof response?.model === 'string' ? response.model : '',
    output_text: typeof response?.output_text === 'string' ? response.output_text : '',
    usage: response?.usage ?? null,
  };
}
