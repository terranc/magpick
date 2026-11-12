import {
  chmod,
  copyFile,
  cp,
  mkdir,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';
import { gatewayBaseForProtocol } from './agents/registry.js';
import { modelSlug } from './model-slug.js';
import type { LaunchPlan, ModelEntry, WireProtocol } from './types.js';

const PI_CONFIG_BASE = path.join(os.homedir(), '.magpick', 'pi');
const DEFAULT_AGENT_DIR = path.join(os.homedir(), '.pi', 'agent');
const SKIPPED_FILES = new Set(['models.json', 'models-store.json']);

type PiApi =
  | 'anthropic-messages'
  | 'openai-responses'
  | 'openai-completions';

const PI_API_BY_PROTOCOL: Record<WireProtocol, PiApi> = {
  messages: 'anthropic-messages',
  responses: 'openai-responses',
  chat: 'openai-completions',
};

export async function createPiPlan(
  model: ModelEntry,
  protocol: WireProtocol,
  gatewayUrl: string,
  gatewayKey: string
): Promise<LaunchPlan> {
  const baseAgentDir = path.resolve(
    process.env.PI_CODING_AGENT_DIR?.trim() || DEFAULT_AGENT_DIR
  );
  const workDir = path.join(PI_CONFIG_BASE, modelSlug(model.id));
  const nested = isSameOrInside(workDir, baseAgentDir) || isSameOrInside(baseAgentDir, workDir);

  await mkdir(PI_CONFIG_BASE, { recursive: true });
  if (!nested) {
    await rm(workDir, { recursive: true, force: true });
  }
  await mkdir(workDir, { recursive: true });

  if (!nested) {
    await mirrorAgentDir(baseAgentDir, workDir);
  }

  const modelsPath = path.join(workDir, 'models.json');
  const models = buildPiModels(model, protocol, gatewayUrl, gatewayKey);
  await writeFile(modelsPath, JSON.stringify(models, null, 2), {
    encoding: 'utf-8',
    mode: 0o600,
  });
  await chmod(modelsPath, 0o600).catch(() => undefined);

  const env: Record<string, string> = {
    PI_CODING_AGENT_DIR: workDir,
  };

  if (!process.env.PI_CODING_AGENT_SESSION_DIR?.trim()) {
    env.PI_CODING_AGENT_SESSION_DIR = path.join(baseAgentDir, 'sessions');
  }

  return {
    env,
    prependArgs: ['--provider', 'magpie', '--model', model.id],
  };
}

export async function clearPiConfigs(): Promise<number> {
  if (!existsSync(PI_CONFIG_BASE)) {
    return 0;
  }

  const entries = await readdir(PI_CONFIG_BASE);
  await rm(PI_CONFIG_BASE, { recursive: true, force: true });
  return entries.length;
}

async function mirrorAgentDir(sourceDir: string, targetDir: string): Promise<void> {
  if (!existsSync(sourceDir)) {
    return;
  }

  let entries;
  try {
    entries = await readdir(sourceDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (SKIPPED_FILES.has(entry.name)) {
      continue;
    }

    const source = path.join(sourceDir, entry.name);
    const target = path.join(targetDir, entry.name);

    try {
      await symlink(
        source,
        target,
        entry.isDirectory() && process.platform === 'win32' ? 'junction' : undefined
      );
    } catch {
      try {
        if (entry.isDirectory()) {
          await cp(source, target, { recursive: true, force: true });
        } else {
          await copyFile(source, target);
        }
      } catch {
        // A resource that cannot be mirrored must not block model selection.
      }
    }
  }
}

function buildPiModels(
  model: ModelEntry,
  protocol: WireProtocol,
  gatewayUrl: string,
  gatewayKey: string
): Record<string, unknown> {
  const piModel: Record<string, unknown> = {
    id: model.id,
    name: model.displayName,
    reasoning: model.reasoningLevels.length > 0,
    input:
      model.inputModalities.length > 0 ? model.inputModalities : ['text'],
  };

  if (model.contextWindow !== undefined) {
    piModel.contextWindow = model.contextWindow;
  }

  if (model.maxOutputTokens !== undefined) {
    piModel.maxTokens = model.maxOutputTokens;
  }

  if (model.reasoningLevels.length > 0) {
    piModel.thinkingLevelMap = buildThinkingLevelMap(model.reasoningLevels);
  }

  return {
    providers: {
      magpie: {
        api: PI_API_BY_PROTOCOL[protocol],
        baseUrl: gatewayBaseForProtocol(gatewayUrl, protocol),
        apiKey: gatewayKey,
        compat: { sendSessionAffinityHeaders: true },
        name: 'magpie',
        models: [piModel],
      },
    },
  };
}

function buildThinkingLevelMap(levels: string[]): Record<string, string | null> {
  const available = new Set(levels.map((level) => level.toLowerCase()));
  const map: Record<string, string | null> = {
    off: available.has('off') || available.has('none') ? 'none' : null,
    low: available.has('low') ? 'low' : null,
    medium: available.has('medium') ? 'medium' : null,
    high: available.has('high') ? 'high' : null,
    xhigh: available.has('xhigh') ? 'xhigh' : null,
    max: available.has('max') ? 'max' : null,
  };

  if (available.has('minimal')) {
    map.minimal = 'minimal';
  }

  return map;
}

function isSameOrInside(child: string, parent: string): boolean {
  return child === parent || child.startsWith(`${parent}${path.sep}`);
}
