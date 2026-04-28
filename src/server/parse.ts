/**
 * Parse Oz CLI NDJSON stream output into structured data.
 *
 * Oz emits newline-delimited JSON events:
 *   {"type":"system","event_type":"run_started","run_id":"...","run_url":"..."}
 *   {"type":"system","event_type":"conversation_started","conversation_id":"..."}
 *   {"type":"tool_call","tool":"run_command","command":"..."}
 *   {"type":"tool_result","tool":"run_command","status":"complete","exit_code":0,"output":"..."}
 *   {"type":"agent","text":"..."}
 *   {"type":"system","event_type":"run_completed","usage":{...},"cost_usd":...}
 */

export interface OzRunStarted {
  type: "system";
  event_type: "run_started";
  run_id: string;
  run_url?: string;
}

export interface OzConversationStarted {
  type: "system";
  event_type: "conversation_started";
  conversation_id: string;
}

export interface OzToolCall {
  type: "tool_call";
  tool: string;
  command?: string;
  [key: string]: unknown;
}

export interface OzToolResult {
  type: "tool_result";
  tool: string;
  status: string;
  exit_code?: number;
  output?: string;
  [key: string]: unknown;
}

export interface OzAgentText {
  type: "agent";
  text: string;
}

export interface OzRunCompleted {
  type: "system";
  event_type: "run_completed";
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
  };
  cost_usd?: number;
  model?: string;
}

export interface OzSystemEvent {
  type: "system";
  event_type: string;
  [key: string]: unknown;
}

export type OzEvent =
  | OzRunStarted
  | OzConversationStarted
  | OzToolCall
  | OzToolResult
  | OzAgentText
  | OzRunCompleted
  | OzSystemEvent;

export function parseOzEvent(line: string): OzEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as OzEvent;
  } catch {
    return null;
  }
}

export interface OzStreamResult {
  runId: string | null;
  runUrl: string | null;
  conversationId: string | null;
  agentText: string;
  model: string | null;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens: number;
  };
  costUsd: number;
}

export function parseOzStreamOutput(stdout: string): OzStreamResult {
  const result: OzStreamResult = {
    runId: null,
    runUrl: null,
    conversationId: null,
    agentText: "",
    model: null,
    usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
    costUsd: 0,
  };

  for (const line of stdout.split(/\r?\n/)) {
    const event = parseOzEvent(line);
    if (!event) continue;

    if (event.type === "system") {
      const sys = event as Record<string, unknown>;
      const eventType = sys.event_type as string;
      if (eventType === "run_started") {
        result.runId = typeof sys.run_id === "string" ? sys.run_id : null;
        result.runUrl = typeof sys.run_url === "string" ? sys.run_url : null;
      } else if (eventType === "conversation_started") {
        result.conversationId = typeof sys.conversation_id === "string" ? sys.conversation_id : null;
      } else if (eventType === "run_completed") {
        const usage = sys.usage as Record<string, unknown> | undefined;
        if (usage) {
          result.usage.inputTokens = typeof usage.input_tokens === "number" ? usage.input_tokens : 0;
          result.usage.outputTokens = typeof usage.output_tokens === "number" ? usage.output_tokens : 0;
          result.usage.cachedInputTokens = typeof usage.cache_read_input_tokens === "number" ? usage.cache_read_input_tokens : 0;
        }
        if (typeof sys.cost_usd === "number") result.costUsd = sys.cost_usd;
        if (typeof sys.model === "string") result.model = sys.model;
      }
    } else if (event.type === "agent") {
      result.agentText += (event as OzAgentText).text;
    }
  }

  return result;
}
