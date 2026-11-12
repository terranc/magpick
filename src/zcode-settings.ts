import { chmod, mkdir, readdir, rm, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';
import { gatewayBaseForProtocol } from './agents/registry.js';
import { modelSlug } from './model-slug.js';
import type { ModelEntry, WireProtocol } from './types.js';

const ZCODE_CONFIG_BASE = path.join(os.homedir(), '.magpick', 'zcode');
const PROVIDER_ID = 'magpie';

const API_TYPE_BY_PROTOCOL: Record<WireProtocol, string> = {
  messages: 'anthropic-messages',
  responses: 'openai-responses',
  chat: 'openai-chat-completions',
};

export async function createZcodeConfig(
  model: ModelEntry,
  protocol: WireProtocol,
  gatewayUrl: string,
  gatewayKey: string
): Promise<string> {
  const dir = path.join(ZCODE_CONFIG_BASE, modelSlug(model.id));
  const file = path.join(dir, 'provider_config.json');

  await mkdir(dir, { recursive: true });

  const config = {
    schemaVersion: 1,
    config: {
      providerConfigRules: {
        providerRules: [
          {
            providerId: PROVIDER_ID,
            providerName: 'Magpie',
            enabled: true,
            config: {
              group: 'standard-personal',
              access: { type: 'api-key', apiKey: gatewayKey },
              api: {
                type: API_TYPE_BY_PROTOCOL[protocol],
                baseUrl: gatewayBaseForProtocol(gatewayUrl, protocol),
              },
              personalModelIds: [model.id],
              modelOrder: [model.id],
              visibility: 'visible',
            },
          },
        ],
      },
      modelConfigRules: {
        providerModelRules: [
          {
            providerId: PROVIDER_ID,
            modelId: model.id,
            config: {
              enabled: true,
              properties: buildModelProperties(model),
            },
          },
        ],
        manualProviderModelRules: [],
      },
      defaultModelSelection: {
        providerId: PROVIDER_ID,
        modelId: model.id,
      },
    },
  };

  await writeFile(file, JSON.stringify(config, null, 2), {
    encoding: 'utf-8',
    mode: 0o600,
  });
  await chmod(file, 0o600).catch(() => undefined);

  return file;
}

export async function clearZcodeConfigs(): Promise<number> {
  if (!existsSync(ZCODE_CONFIG_BASE)) {
    return 0;
  }

  const entries = await readdir(ZCODE_CONFIG_BASE);
  await rm(ZCODE_CONFIG_BASE, { recursive: true, force: true });
  return entries.length;
}

function buildModelProperties(model: ModelEntry): Record<string, unknown> {
  const modalities = new Set(
    model.inputModalities.map((modality) => modality.toLowerCase())
  );
  const properties: Record<string, unknown> = {
    inputFormat: {
      supportsText: true,
      supportsImage: modalities.has('image'),
      supportsVideo: modalities.has('video'),
      supportsAudio: modalities.has('audio'),
      supportsPdf: modalities.has('pdf'),
    },
    outputFormat: { supportsText: true },
    supportsToolCall: true,
    supportsJsonSchemaOutput: false,
    supportsNativeWebSearch: false,
    supportsMidConversationSystem: false,
  };

  if (model.contextWindow !== undefined) {
    properties.contextWindow = model.contextWindow;
  }

  return properties;
}
