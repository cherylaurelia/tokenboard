// A raw Claude Code assistant usage line, annotated with the provenance the dedup
// step needs (sourcePath + lineIndex give a deterministic stable order; messageId is
// the dedup key). This is the pre-normalize shape — field mapping happens later in
// claude-code-map.ts. Token counts stay nested under `usage` until then.

export interface ClaudeUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_creation?: {
    ephemeral_5m_input_tokens?: number;
    ephemeral_1h_input_tokens?: number;
  };
}

export interface AssistantUsageLine {
  type: "assistant";
  message: { id?: string; model?: string; usage: ClaudeUsage };
  timestamp?: string;
  isApiErrorMessage?: boolean;
}

export interface ParsedLine {
  messageId: string | null; // line.message.id ?? null (dedup key)
  model: string;
  usage: ClaudeUsage;
  timestamp: string | null;
  sourcePath: string; // absolute path of the originating .jsonl file
  lineIndex: number; // 0-based line position within that file
}
