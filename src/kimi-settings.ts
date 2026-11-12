import { gatewayBaseForProtocol } from './agents/registry.js';
import type { ModelEntry, WireProtocol } from './types.js';

export function createKimiEnv(
  model: ModelEntry,
  protocol: WireProtocol,
  gatewayUrl: string,
  gatewayKey: string
): Record<string, string> {
  const env: Record<string, string> = {
    KIMI_MODEL_NAME: model.id,
    KIMI_MODEL_API_KEY: gatewayKey,
    KIMI_MODEL_PROVIDER_TYPE: protocol === 'messages' ? 'anthropic' : 'openai',
    KIMI_MODEL_BASE_URL: gatewayBaseForProtocol(gatewayUrl, protocol),
    KIMI_MODEL_DISPLAY_NAME: model.displayName,
  };

  if (model.contextWindow !== undefined) {
    env.KIMI_MODEL_MAX_CONTEXT_SIZE = String(model.contextWindow);
  }

  if (protocol === 'messages' && model.maxOutputTokens !== undefined) {
    env.KIMI_MODEL_MAX_OUTPUT_SIZE = String(model.maxOutputTokens);
  }

  const capabilities = readCapabilities(model);
  if (capabilities.length > 0) {
    env.KIMI_MODEL_CAPABILITIES = capabilities.join(',');
  }

  return env;
}

function readCapabilities(model: ModelEntry): string[] {
  const capabilities: string[] = [];
  const modalities = new Set(
    model.inputModalities.map((modality) => modality.toLowerCase())
  );

  if (model.reasoningLevels.length > 0) {
    capabilities.push('thinking');
  }
  if (modalities.has('image')) {
    capabilities.push('image_in');
  }
  if (modalities.has('video')) {
    capabilities.push('video_in');
  }

  return capabilities;
}
