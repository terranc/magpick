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
    const parsed: unknown = JSON.parse(stripJsonCommentsAndTrailingCommas(content));
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

/**
 * Strip `//` line comments, `/* ... *\/` block comments, and trailing commas
 * outside string literals so config.json supports JSONC.
 */
function stripJsonCommentsAndTrailingCommas(input: string): string {
  const withoutComments = stripJsonComments(input);
  let result = '';
  let inString = false;
  let escaped = false;

  for (let i = 0; i < withoutComments.length; i += 1) {
    const ch = withoutComments[i];

    if (inString) {
      result += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      result += ch;
      continue;
    }

    if (ch === ',') {
      let next = i + 1;
      while (next < withoutComments.length && /\s/.test(withoutComments[next])) {
        next += 1;
      }
      if (withoutComments[next] === '}' || withoutComments[next] === ']') {
        continue;
      }
    }

    result += ch;
  }

  return result;
}

function stripJsonComments(input: string): string {
  let result = '';
  let inString = false;
  let escaped = false;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];

    if (inString) {
      result += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      result += ch;
      continue;
    }

    if (ch === '/' && input[i + 1] === '/') {
      i += 2;
      while (i < input.length && input[i] !== '\n') {
        i += 1;
      }
      if (i < input.length) {
        result += '\n';
      }
      continue;
    }

    if (ch === '/' && input[i + 1] === '*') {
      i += 2;
      while (i < input.length && !(input[i] === '*' && input[i + 1] === '/')) {
        if (input[i] === '\n') {
          result += '\n';
        }
        i += 1;
      }
      i += 1;
      continue;
    }

    result += ch;
  }

  return result;
}
