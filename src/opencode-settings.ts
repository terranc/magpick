import { gatewayBaseForProtocol } from './agents/registry.js';
import type { ModelEntry, WireProtocol } from './types.js';

const PROVIDER_ID = 'magpie';

const PACKAGE_BY_PROTOCOL: Record<WireProtocol, string> = {
  messages: 'aisdk:@ai-sdk/anthropic',
  responses: 'aisdk:@ai-sdk/openai',
  chat: 'aisdk:@ai-sdk/openai-compatible',
};

export function createOpencodeEnv(
  model: ModelEntry,
  protocol: WireProtocol,
  gatewayUrl: string,
  gatewayKey: string
): Record<string, string> {
  const modelConfig: Record<string, unknown> = {
    name: model.displayName,
    capabilities: {
      input: readInputs(model),
      output: ['text'],
      tools: true,
    },
  };

  const limit = readLimit(model);
  if (limit) {
    modelConfig.limit = limit;
  }

  const variants = buildVariants(model, protocol);
  if (variants.length > 0) {
    modelConfig.variants = variants;
  }

  const config = {
    model: `${PROVIDER_ID}/${model.id}`,
    providers: {
      [PROVIDER_ID]: {
        package: PACKAGE_BY_PROTOCOL[protocol],
        name: 'Magpie',
        settings: {
          apiKey: gatewayKey,
          baseURL: gatewayBaseForProtocol(gatewayUrl, protocol),
        },
        models: {
          [model.id]: modelConfig,
        },
      },
    },
  };

  return { OPENCODE_CONFIG_CONTENT: JSON.stringify(config) };
}

function readInputs(model: ModelEntry): string[] {
  const inputs = ['text'];

  for (const modality of model.inputModalities) {
    if (modality !== 'text' && !inputs.includes(modality)) {
      inputs.push(modality);
    }
  }

  return inputs;
}

function readLimit(model: ModelEntry): Record<string, number> | undefined {
  const limit: Record<string, number> = {};

  if (model.contextWindow !== undefined) {
    limit.context = model.contextWindow;
  }
  if (model.maxOutputTokens !== undefined) {
    limit.output = model.maxOutputTokens;
  }

  return Object.keys(limit).length > 0 ? limit : undefined;
}

function buildVariants(
  model: ModelEntry,
  protocol: WireProtocol
): Array<{ id: string; settings: { reasoningEffort: string } }> {
  if (protocol === 'messages') {
    return [];
  }

  const levels = new Set<string>();
  for (const level of model.reasoningLevels) {
    levels.add(level.toLowerCase() === 'off' ? 'none' : level);
  }

  return [...levels].map((level) => ({
    id: level,
    settings: { reasoningEffort: level },
  }));
}
