import type { AgentType, ModelEntry, WireProtocol } from '../types.js';

export interface AgentDefinition {
  type: AgentType;
  label: string;
  bin: string;
  protocols: readonly WireProtocol[];
  preference: readonly WireProtocol[];
  defaultProtocol: WireProtocol;
}

export const AGENTS: Record<AgentType, AgentDefinition> = {
  claude: {
    type: 'claude',
    label: 'Claude Code',
    bin: 'claude',
    protocols: ['messages'],
    preference: ['messages'],
    defaultProtocol: 'messages',
  },
  codex: {
    type: 'codex',
    label: 'Codex',
    bin: 'codex',
    protocols: ['responses'],
    preference: ['responses'],
    defaultProtocol: 'responses',
  },
  pi: {
    type: 'pi',
    label: 'Pi',
    bin: 'pi',
    protocols: ['chat', 'responses', 'messages'],
    preference: ['chat', 'responses', 'messages'],
    defaultProtocol: 'chat',
  },
  kimi: {
    type: 'kimi',
    label: 'Kimi Code',
    bin: 'kimi',
    protocols: ['chat', 'messages'],
    preference: ['chat', 'messages'],
    defaultProtocol: 'chat',
  },
  opencode: {
    type: 'opencode',
    label: 'OpenCode',
    bin: 'opencode',
    protocols: ['chat', 'responses', 'messages'],
    preference: ['chat', 'responses', 'messages'],
    defaultProtocol: 'chat',
  },
  zcode: {
    type: 'zcode',
    label: 'ZCode',
    bin: 'zcode',
    protocols: ['chat', 'responses', 'messages'],
    preference: ['chat', 'responses', 'messages'],
    defaultProtocol: 'chat',
  },
};

const ENDPOINT_BY_PROTOCOL: Record<WireProtocol, string> = {
  messages: '/v1/messages',
  responses: '/v1/responses',
  chat: '/v1/chat/completions',
};

export function isAgentType(value: string): value is AgentType {
  return value in AGENTS;
}

export function agentLabel(agent: AgentType): string {
  return AGENTS[agent].label;
}

export function protocolEndpoint(protocol: WireProtocol): string {
  return ENDPOINT_BY_PROTOCOL[protocol];
}

export function gatewayBaseForProtocol(
  gatewayUrl: string,
  protocol: WireProtocol
): string {
  return protocol === 'messages' ? gatewayUrl : `${gatewayUrl}/v1`;
}

export function resolveProtocol(
  agent: AgentType,
  model: ModelEntry
): WireProtocol | undefined {
  const definition = AGENTS[agent];

  if (model.isGroup) {
    return definition.defaultProtocol;
  }

  for (const protocol of definition.preference) {
    if (model.nativeEndpoints.includes(protocolEndpoint(protocol))) {
      return protocol;
    }
  }

  return undefined;
}
