export interface ResponsesRequest {
  model?: string;
  instructions?: unknown;
  input?: unknown;
  stream?: boolean;
  temperature?: number;
  max_output_tokens?: number;
  max_completion_tokens?: number;
  metadata?: Record<string, unknown>;
}
