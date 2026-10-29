import { chmod, mkdir, readFile, readdir, rm, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { createHash } from 'crypto';
import path from 'path';
import os from 'os';
import { fetchCodexCatalog } from './gateway.js';
import type { ModelEntry } from './types.js';

const CODEX_BASE = path.join(os.homedir(), '.magpick', 'codex');
const USER_CODEX_CONFIG = path.join(os.homedir(), '.codex', 'config.toml');

const TOP_LEVEL_KEYS = new Set([
  'model',
  'model_provider',
  'model_catalog_json',
  'model_catalog_url',
  'openai_base_url',
  'model_context_window',
  'model_auto_compact_token_limit',
  'model_max_output_tokens',
  'model_supports_reasoning_summaries',
  'model_reasoning_effort',
  'model_reasoning_summary',
  'model_verbosity',
]);

export async function createCodexConfig(
  model: ModelEntry,
  gatewayUrl: string,
  gatewayKey: string
): Promise<string> {
  const catalog = await fetchCodexCatalog(gatewayUrl);
  const codexHome = path.join(CODEX_BASE, modelSlug(model.id));

  await mkdir(codexHome, { recursive: true });

  const catalogPath = path.join(codexHome, 'magpie-models.json');
  await writeFile(catalogPath, catalog, { encoding: 'utf-8', mode: 0o600 });
  await chmod(catalogPath, 0o600).catch(() => undefined);

  const base = await readBaseConfig();
  const config = buildConfig(base, model.id, gatewayUrl, catalogPath, gatewayKey);
  const configPath = path.join(codexHome, 'config.toml');

  await writeFile(configPath, config, { encoding: 'utf-8', mode: 0o600 });
  await chmod(configPath, 0o600).catch(() => undefined);

  return codexHome;
}

export async function clearCodexConfigs(): Promise<number> {
  if (!existsSync(CODEX_BASE)) {
    return 0;
  }

  const entries = await readdir(CODEX_BASE);
  await rm(CODEX_BASE, { recursive: true, force: true });
  return entries.length;
}

function buildConfig(
  base: string,
  modelId: string,
  gatewayUrl: string,
  catalogPath: string,
  gatewayKey: string
): string {
  let clean = removeTopLevelKeys(base, TOP_LEVEL_KEYS);
  clean = removeSection(clean, 'model_providers.magpie').trim();
  clean = clean.replace(/^\uFEFF/, '');

  const lines = [
    'model_provider = "magpie"',
    `model = ${tomlString(modelId)}`,
    `model_catalog_json = ${tomlString(catalogPath)}`,
    '',
  ];

  if (clean) {
    lines.push(clean, '');
  }

  lines.push(
    '[model_providers.magpie]',
    'name = "magpie"',
    `base_url = ${tomlString(`${gatewayUrl}/v1`)}`,
    'wire_api = "responses"',
    'supports_websockets = false',
    `experimental_bearer_token = ${tomlString(gatewayKey)}`,
    'http_headers = { "x-openai-actor-authorization" = "magpie" }',
    ''
  );

  return lines.join('\n');
}

/**
 * Remove keys that only apply to the top-level table. Keys inside sections are
 * left alone; TOML has no way back to the top-level table after a section.
 */
function removeTopLevelKeys(content: string, keys: Set<string>): string {
  const lines = content.split('\n');
  const result: string[] = [];
  let topLevel = true;

  for (const line of lines) {
    if (/^\s*\[/.test(line)) {
      topLevel = false;
    }

    if (topLevel) {
      const match = line.match(/^\s*([A-Za-z0-9_-]+)\s*=/);
      if (match && keys.has(match[1])) {
        continue;
      }
    }

    result.push(line);
  }

  return result.join('\n');
}

function removeSection(content: string, section: string): string {
  const lines = content.split('\n');
  const result: string[] = [];
  let skipping = false;

  for (const line of lines) {
    const match = line.match(/^\s*\[([^\]]+)\]\s*$/);
    if (match) {
      const name = match[1].trim();
      skipping = name === section || name.startsWith(`${section}.`);
      if (skipping) {
        continue;
      }
    } else if (skipping) {
      continue;
    }

    result.push(line);
  }

  return result.join('\n');
}

function tomlString(value: string): string {
  return JSON.stringify(value);
}

async function readBaseConfig(): Promise<string> {
  if (!existsSync(USER_CODEX_CONFIG)) {
    return '';
  }

  try {
    return await readFile(USER_CODEX_CONFIG, 'utf-8');
  } catch {
    return '';
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
