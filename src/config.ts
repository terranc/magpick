import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';

const CONFIG_FILE = path.join(os.homedir(), '.magpick', 'config.json');

export const DEFAULT_CLAUDE_ENV: Record<string, string> = {
  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
};

export interface MagpickConfig {
  claude?: {
    env?: Record<string, string | number | boolean | null>;
  };
}

export async function loadConfig(
  configPath = CONFIG_FILE
): Promise<MagpickConfig> {
  if (!existsSync(configPath)) {
    return {};
  }

  try {
    const content = await readFile(configPath, 'utf-8');
    const parsed: unknown = JSON.parse(content);
    return isRecord(parsed) ? (parsed as MagpickConfig) : {};
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Warning: failed to parse ${configPath}: ${message}`);
    return {};
  }
}

export function resolveClaudeEnv(config: MagpickConfig): Record<string, string> {
  const resolved: Record<string, string> = { ...DEFAULT_CLAUDE_ENV };
  const overrides =
    isRecord(config.claude) && isRecord(config.claude.env)
      ? config.claude.env
      : undefined;

  if (!overrides) {
    return resolved;
  }

  for (const [key, value] of Object.entries(overrides)) {
    if (value === null) {
      delete resolved[key];
    } else if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      resolved[key] = String(value);
    }
  }

  return resolved;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
