import { createClaudeSettings } from '../claude-settings.js';
import {
  CODEX_GATEWAY_KEY_ENV,
  buildCodexOverrides,
  codexNoDaemonArgs,
  createCodexCatalog,
  resolveCodexHomeOverride,
} from '../codex-settings.js';
import { createKimiEnv } from '../kimi-settings.js';
import { createOpencodeEnv } from '../opencode-settings.js';
import { createPiPlan } from '../pi-settings.js';
import { createZcodeConfig } from '../zcode-settings.js';
import type {
  AgentType,
  LaunchPlan,
  ModelEntry,
  WireProtocol,
} from '../types.js';

export async function prepareLaunch(
  agent: AgentType,
  model: ModelEntry,
  protocol: WireProtocol,
  gatewayUrl: string,
  gatewayKey: string,
  args: string[] = []
): Promise<LaunchPlan> {
  switch (agent) {
    case 'claude': {
      const settingsPath = await createClaudeSettings(
        model,
        gatewayUrl,
        gatewayKey
      );

      return {
        prependArgs: [`--settings=${settingsPath}`],
        env: {
          ANTHROPIC_BASE_URL: gatewayUrl,
          ANTHROPIC_AUTH_TOKEN: gatewayKey,
          ANTHROPIC_MODEL: model.id,
        },
      };
    }

    case 'codex': {
      const catalogPath = await createCodexCatalog(model, gatewayUrl);

      return {
        prependArgs: [
          ...codexNoDaemonArgs(args),
          ...buildCodexOverrides(model, gatewayUrl, catalogPath),
        ],
        env: {
          CODEX_HOME: resolveCodexHomeOverride(process.env.CODEX_HOME),
          [CODEX_GATEWAY_KEY_ENV]: gatewayKey,
        },
      };
    }

    case 'pi':
      return createPiPlan(model, protocol, gatewayUrl, gatewayKey);

    case 'kimi':
      return {
        env: createKimiEnv(model, protocol, gatewayUrl, gatewayKey),
      };

    case 'opencode':
      return {
        env: createOpencodeEnv(model, protocol, gatewayUrl, gatewayKey),
      };

    case 'zcode': {
      const file = await createZcodeConfig(
        model,
        protocol,
        gatewayUrl,
        gatewayKey
      );

      return {
        env: { ZCODE_PERSONAL_PROVIDER_CONFIG_FILE: file },
      };
    }
  }
}

export {
  AGENTS,
  agentLabel,
  gatewayBaseForProtocol,
  isAgentType,
  protocolEndpoint,
  resolveProtocol,
} from './registry.js';
