import { chmod, mkdir, readdir, rm, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { execFileSync } from 'child_process';
import path from 'path';
import os from 'os';
import { fetchCodexCatalog } from './gateway.js';
import { modelSlug } from './model-slug.js';
import type { ModelEntry } from './types.js';

const CODEX_BASE = path.join(os.homedir(), '.magpick', 'codex');
const PROVIDER_ID = 'magpick';
const CODEX_NO_DAEMON_MIN_VERSION = [0, 156, 0] as const;

let codexNoDaemonSupport: boolean | undefined;

export const CODEX_GATEWAY_KEY_ENV = 'MAGPIE_GATEWAY_KEY';

/**
 * Old magpick versions exported CODEX_HOME into the launched session. Ignore
 * those inherited values so a nested launch still uses the user's real Codex
 * home; an explicitly configured non-magpick CODEX_HOME is respected.
 */
export function resolveCodexHomeOverride(
  codexHome: string | undefined
): string | undefined {
  const value = codexHome?.trim();
  if (!value) {
    return undefined;
  }

  const base = path.resolve(CODEX_BASE);
  const resolved = path.resolve(value);
  if (resolved === base || resolved.startsWith(`${base}${path.sep}`)) {
    return undefined;
  }

  return value;
}

export async function createCodexCatalog(
  model: ModelEntry,
  gatewayUrl: string
): Promise<string> {
  const catalog = await fetchCodexCatalog(gatewayUrl);
  const codexHome = path.join(CODEX_BASE, modelSlug(model.id));

  await mkdir(codexHome, { recursive: true });

  const catalogPath = path.join(codexHome, 'magpie-models.json');
  await writeFile(catalogPath, catalog, { encoding: 'utf-8', mode: 0o600 });
  await chmod(catalogPath, 0o600).catch(() => undefined);

  return catalogPath;
}

export async function clearCodexConfigs(): Promise<number> {
  if (!existsSync(CODEX_BASE)) {
    return 0;
  }

  const entries = await readdir(CODEX_BASE);
  await rm(CODEX_BASE, { recursive: true, force: true });
  return entries.length;
}

/**
 * Keep the user's real CODEX_HOME (plugins, MCP servers, skills, hooks,
 * sessions) and override only the model selection for this process.
 */
export function buildCodexOverrides(
  model: ModelEntry,
  gatewayUrl: string,
  catalogPath: string
): string[] {
  return [
    '-c',
    `model_provider=${tomlString(PROVIDER_ID)}`,
    '-c',
    `model=${tomlString(model.id)}`,
    '-c',
    `model_catalog_json=${tomlString(catalogPath)}`,
    '-c',
    `model_providers.${PROVIDER_ID}.name="magpie"`,
    '-c',
    `model_providers.${PROVIDER_ID}.base_url=${tomlString(`${gatewayUrl}/v1`)}`,
    '-c',
    `model_providers.${PROVIDER_ID}.wire_api="responses"`,
    '-c',
    `model_providers.${PROVIDER_ID}.supports_websockets=false`,
    '-c',
    `model_providers.${PROVIDER_ID}.requires_openai_auth=false`,
    '-c',
    `model_providers.${PROVIDER_ID}.env_key=${tomlString(CODEX_GATEWAY_KEY_ENV)}`,
    '-c',
    `model_providers.${PROVIDER_ID}.http_headers={"x-openai-actor-authorization"="magpie"}`,
  ];
}

/**
 * Codex 0.156+ treats `-c` overrides as an embedded-only session and warns
 * when the shared background server is skipped. `--no-daemon` makes that
 * choice explicit without changing the effective configuration.
 */
export function codexNoDaemonArgs(args: string[]): string[] {
  if (
    !supportsCodexNoDaemon() ||
    args.includes('--no-daemon') ||
    args.some((arg) => arg === '--remote' || arg.startsWith('--remote='))
  ) {
    return [];
  }

  return ['--no-daemon'];
}

function supportsCodexNoDaemon(): boolean {
  if (codexNoDaemonSupport !== undefined) {
    return codexNoDaemonSupport;
  }

  const version = readCodexVersion();
  if (version) {
    codexNoDaemonSupport = isAtLeastVersion(
      version,
      CODEX_NO_DAEMON_MIN_VERSION
    );
  } else {
    codexNoDaemonSupport = false;
  }

  return codexNoDaemonSupport;
}

function readCodexVersion(): string | undefined {
  const options = {
    encoding: 'utf-8' as const,
    stdio: ['ignore', 'pipe', 'ignore'] as ['ignore', 'pipe', 'ignore'],
    timeout: 5000,
  };
  const userShell = process.env.SHELL;

  try {
    const output = userShell
      ? execFileSync(userShell, ['-l', '-c', 'codex --version'], options)
      : execFileSync('codex', ['--version'], {
          ...options,
          shell: process.platform === 'win32',
        });
    return output.trim();
  } catch {
    return undefined;
  }
}

function isAtLeastVersion(
  output: string,
  minimum: readonly [number, number, number]
): boolean {
  const match = output.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    return false;
  }

  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);

  return (
    major > minimum[0] ||
    (major === minimum[0] &&
      (minor > minimum[1] ||
        (minor === minimum[1] && patch >= minimum[2])))
  );
}

function tomlString(value: string): string {
  return JSON.stringify(value);
}
