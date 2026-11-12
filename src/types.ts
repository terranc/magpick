export type AgentType =
  | 'claude'
  | 'codex'
  | 'pi'
  | 'kimi'
  | 'opencode'
  | 'zcode';

export type WireProtocol = 'messages' | 'responses' | 'chat';

export interface LaunchPlan {
  env: Record<string, string | undefined>;
  prependArgs?: string[];
}

/**
 * One selectable row: a provider model or a Magpie routing group.
 */
export interface ModelEntry {
  id: string;
  displayName: string;
  provider: string;
  label: string;
  isGroup: boolean;
  nativeEndpoints: string[];
  contextWindow?: number;
  maxOutputTokens?: number;
  reasoningLevels: string[];
  pricing?: Record<string, string>;
  inputModalities: string[];
}

export interface HistoryEntry {
  agent: AgentType;
  modelId: string;
  timestamp: number;
}
