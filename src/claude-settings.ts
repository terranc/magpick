import { chmod, mkdir, readFile, readdir, unlink, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { createHash } from 'crypto';
import path from 'path';
import os from 'os';
import type { ModelEntry } from './types.js';

const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const BASE_SETTINGS = path.join(CLAUDE_DIR, 'settings.json');
const SETTINGS_PREFIX = 'magpick-';
const SETTINGS_PATTERN = /^magpick-.*\.settings\.json$/;
const MAX_CONTEXT_TOKENS = 1_000_000;

interface ClaudeSettings {
  env?: Record<string, string>;
  model?: string;
  [key: string]: unknown;
}

export async function createClaudeSettings(
  model: ModelEntry,
  gatewayUrl: string,
  gatewayKey: string
): Promise<string> {
  await mkdir(CLAUDE_DIR, { recursive: true });

  const base = await readSettings(BASE_SETTINGS);
  const env = isRecord(base.env) ? { ...base.env } : {};

  for (const key of Object.keys(env)) {
    if (isConflictingAnthropicKey(key)) {
      delete env[key];
    }
  }

  env.ANTHROPIC_BASE_URL = gatewayUrl;
  env.ANTHROPIC_AUTH_TOKEN = gatewayKey;
  env.ANTHROPIC_DEFAULT_HAIKU_MODEL = model.id;
  env.ANTHROPIC_DEFAULT_SONNET_MODEL = model.id;
  env.ANTHROPIC_DEFAULT_OPUS_MODEL = model.id;
  env.ANTHROPIC_DEFAULT_FABLE_MODEL = model.id;
  env.ANTHROPIC_SMALL_FAST_MODEL = model.id;
  // Clear a model id inherited from the shell; the top-level `model` wins.
  env.ANTHROPIC_MODEL = '';

  // Claude Code assumes a 200K window for model ids it does not recognize,
  // which is every Magpie model. Tell it the real window so large-context
  // models get their full capacity; cap at 1M, the largest window Claude Code
  // supports without the 1M beta opt-in.
  if (model.contextWindow) {
    env.CLAUDE_CODE_MAX_CONTEXT_TOKENS = String(
      Math.min(model.contextWindow, MAX_CONTEXT_TOKENS)
    );
  }

  const settings: ClaudeSettings = {
    ...base,
    model: model.id,
    env,
  };

  const settingsPath = path.join(
    CLAUDE_DIR,
    `${SETTINGS_PREFIX}${modelSlug(model.id)}.settings.json`
  );

  await writeFile(settingsPath, JSON.stringify(settings, null, 2), {
    encoding: 'utf-8',
    mode: 0o600,
  });
  await chmod(settingsPath, 0o600).catch(() => undefined);

  return settingsPath;
}

export async function clearClaudeSettings(): Promise<number> {
  if (!existsSync(CLAUDE_DIR)) {
    return 0;
  }

  const files = await readdir(CLAUDE_DIR);
  let removed = 0;

  await Promise.all(
    files
      .filter((file) => SETTINGS_PATTERN.test(file))
      .map(async (file) => {
        await unlink(path.join(CLAUDE_DIR, file));
        removed += 1;
      })
  );

  return removed;
}

function isConflictingAnthropicKey(key: string): boolean {
  if (
    key === 'ANTHROPIC_BASE_URL' ||
    key === 'ANTHROPIC_AUTH_TOKEN' ||
    key === 'ANTHROPIC_API_KEY' ||
    key === 'ANTHROPIC_MODEL' ||
    key === 'ANTHROPIC_SMALL_FAST_MODEL' ||
    key === 'ANTHROPIC_REASONING_MODEL' ||
    key === 'ANTHROPIC_REASONING_MODEL_NAME' ||
    key === 'ANTHROPIC_BETAS' ||
    key === 'ANTHROPIC_CUSTOM_HEADERS' ||
    key === 'CLAUDE_CODE_MAX_CONTEXT_TOKENS' ||
    key === 'CLAUDE_CODE_MAX_OUTPUT_TOKENS' ||
    key === 'CLAUDE_CODE_MODEL_CAPABILITIES'
  ) {
    return true;
  }

  return /^ANTHROPIC_DEFAULT_.*_MODEL(_NAME)?$/.test(key);
}

async function readSettings(filePath: string): Promise<ClaudeSettings> {
  if (!existsSync(filePath)) {
    return {};
  }

  try {
    const content = await readFile(filePath, 'utf-8');
    const parsed: unknown = JSON.parse(content);
    return isRecord(parsed) ? (parsed as ClaudeSettings) : {};
  } catch {
    return {};
  }
}

function modelSlug(modelId: string): string {
  const readable = modelId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  const hash = createHash('sha1').update(modelId).digest('hex').slice(0, 8);
  return `${readable || 'model'}-${hash}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
