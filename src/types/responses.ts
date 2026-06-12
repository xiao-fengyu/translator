export interface ResponsesTool {
  type?: string;
  name?: string;
  description?: string;
  parameters?: unknown;
  strict?: boolean;
  format?: unknown;
  function?: {
    type?: string;
    name?: string;
    description?: string;
    parameters?: unknown;
    format?: unknown;
  };
  tools?: ResponsesTool[];
}

export interface ResponsesRequest {
  model?: string;
  instructions?: unknown;
  input?: unknown;
  previous_response_id?: string;
  stream?: boolean;
  temperature?: number;
  max_output_tokens?: number;
  max_completion_tokens?: number;
  metadata?: Record<string, unknown>;
  tools?: ResponsesTool[];
  tool_choice?: unknown;
  parallel_tool_calls?: boolean;
}
