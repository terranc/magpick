import type { ModelEntry } from './types.js';

const DEFAULT_GATEWAY = 'http://127.0.0.1:3425';
const DEFAULT_LOCAL_KEY = 'magpie';
const REQUEST_TIMEOUT_MS = 4000;

interface RawModel {
  id?: unknown;
  display_name?: unknown;
  owned_by?: unknown;
  magpie_label?: unknown;
  native_endpoints?: unknown;
  context_window?: unknown;
  context_length?: unknown;
  max_output_tokens?: unknown;
  reasoning_levels?: unknown;
  supported_reasoning_levels?: unknown;
  pricing?: unknown;
  modalities?: unknown;
}

export function resolveGatewayUrl(explicit?: string): string {
  const raw =
    explicit ||
    process.env.MAGPIE_GATEWAY ||
    process.env.MAGPIE_ADDR ||
    DEFAULT_GATEWAY;

  let value = raw.trim();
  if (!value) {
    return DEFAULT_GATEWAY;
  }

  if (value.startsWith('0.0.0.0:')) {
    value = `127.0.0.1:${value.slice('0.0.0.0:'.length)}`;
  } else if (value.startsWith('[::]:')) {
    value = `127.0.0.1:${value.slice('[::]:'.length)}`;
  }

  if (!/^https?:\/\//i.test(value)) {
    value = `http://${value}`;
  }

  value = value.replace(/\/+$/, '');
  value = value.replace(/\/v1$/i, '');
  return value || DEFAULT_GATEWAY;
}

export function getGatewayKey(): string {
  return process.env.MAGPIE_GATEWAY_KEY?.trim() || DEFAULT_LOCAL_KEY;
}

export function isLoopbackGateway(gatewayUrl: string): boolean {
  try {
    const host = new URL(gatewayUrl).hostname.toLowerCase();
    return (
      host === '127.0.0.1' ||
      host === 'localhost' ||
      host === '::1' ||
      host === '[::1]' ||
      host === '0.0.0.0'
    );
  } catch {
    return false;
  }
}

export function assertGatewayKey(gatewayUrl: string): void {
  if (!isLoopbackGateway(gatewayUrl) && !process.env.MAGPIE_GATEWAY_KEY?.trim()) {
    throw new Error(
      `Remote Magpie gateway at ${gatewayUrl} requires MAGPIE_GATEWAY_KEY.\n` +
        'Create a gateway key in Magpie, then export it before running magpick.'
    );
  }
}

export async function fetchModels(gatewayUrl: string): Promise<ModelEntry[]> {
  const url = `${gatewayUrl}/v1/models`;
  const response = await request(url);
  const body = await response.text();

  if (!response.ok) {
    throw new Error(
      `Magpie returned HTTP ${response.status} for ${url}.\n${body.slice(0, 300)}`
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error(`Magpie returned invalid JSON for ${url}.`);
  }

  if (!isRecord(parsed) || !Array.isArray(parsed.data)) {
    throw new Error(`Magpie returned an unexpected model list for ${url}.`);
  }

  return dedupeModels(
    parsed.data
      .map((item) => parseModel(item))
      .filter((item): item is ModelEntry => item !== undefined)
  ).sort(compareModels);
}

/**
 * Magpie serves the same entry under several ids: models come as
 * `provider/model` plus a short alias (`poolside/laguna-s-2.1:free`,
 * `deepseek-v4-1-flash`), and routing groups come as `auto/<name>` plus a bare
 * alias. Keep the most canonical id per (provider, display name) so the picker
 * lists each entry once.
 */
function dedupeModels(models: ModelEntry[]): ModelEntry[] {
  const kept = new Map<string, number>();
  const result: ModelEntry[] = [];

  for (const model of models) {
    const kind = model.isGroup ? 'group' : 'model';
    const name = model.displayName.trim().toLowerCase() || model.id.toLowerCase();
    const key = `${kind}\u0000${model.provider}\u0000${name}`;
    const existingIndex = kept.get(key);

    if (existingIndex === undefined) {
      kept.set(key, result.length);
      result.push(model);
      continue;
    }

    if (canonicalRank(model) < canonicalRank(result[existingIndex])) {
      result[existingIndex] = model;
    }
  }

  return result;
}

/**
 * 0 = `provider/model` (canonical), 1 = other qualified id such as
 * `auto/<name>` or `upstream/model`, 2 = bare alias.
 */
function canonicalRank(model: ModelEntry): number {
  if (model.id.startsWith(`${model.provider}/`)) {
    return 0;
  }

  return model.id.includes('/') ? 1 : 2;
}

export async function fetchCodexCatalog(gatewayUrl: string): Promise<string> {
  const url = `${gatewayUrl}/v1/codex/models`;
  const response = await request(url);
  const body = await response.text();

  if (!response.ok) {
    throw new Error(
      `Magpie returned HTTP ${response.status} for ${url}.\n` +
        'Update Magpie, or check that its gateway exposes /v1/codex/models.'
    );
  }

  try {
    const parsed = JSON.parse(body);
    if (!isRecord(parsed) || !Array.isArray(parsed.models)) {
      throw new Error('missing models array');
    }
  } catch {
    throw new Error(`Magpie returned an invalid Codex catalog for ${url}.`);
  }

  return body;
}

function parseModel(value: unknown): ModelEntry | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const raw = value as RawModel;
  if (typeof raw.id !== 'string' || raw.id.trim() === '') {
    return undefined;
  }

  const id = raw.id.trim();
  const provider = typeof raw.owned_by === 'string' && raw.owned_by
    ? raw.owned_by
    : id.split('/')[0] || 'unknown';
  const displayName =
    typeof raw.display_name === 'string' && raw.display_name.trim()
      ? raw.display_name.trim()
      : id;
  const label =
    typeof raw.magpie_label === 'string' && raw.magpie_label.trim()
      ? raw.magpie_label.trim()
      : displayName;
  const nativeEndpoints = toStringArray(raw.native_endpoints);
  const reasoningLevels = toStringArray(raw.reasoning_levels).length > 0
    ? toStringArray(raw.reasoning_levels)
    : toStringArray(raw.supported_reasoning_levels, 'effort');

  return {
    id,
    displayName,
    provider,
    label,
    isGroup: /routing group/i.test(label) || id.startsWith('auto/'),
    nativeEndpoints,
    contextWindow: toNumber(raw.context_window) ?? toNumber(raw.context_length),
    maxOutputTokens: toNumber(raw.max_output_tokens),
    reasoningLevels,
    pricing: normalizePricing(raw.pricing),
    inputModalities: readInputModalities(raw.modalities),
  };
}

async function request(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, {
      headers: {
        Authorization: `Bearer ${getGatewayKey()}`,
      },
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Timed out after ${REQUEST_TIMEOUT_MS}ms reaching ${url}.`);
    }

    throw new Error(
      `Cannot reach Magpie gateway at ${url}.\n` +
        'Start Magpie (the menu bar app) or run `magpie serve`, then try again.'
    );
  } finally {
    clearTimeout(timer);
  }
}

function normalizePricing(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string' || typeof entry === 'number') {
      result[key] = String(entry);
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

function readInputModalities(value: unknown): string[] {
  if (!isRecord(value)) {
    return [];
  }

  return toStringArray(value.input);
}

function toStringArray(value: unknown, field?: string): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const result: string[] = [];
  for (const item of value) {
    if (typeof item === 'string') {
      result.push(item);
    } else if (field && isRecord(item) && typeof item[field] === 'string') {
      result.push(item[field]);
    }
  }

  return result;
}

function toNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function compareModels(a: ModelEntry, b: ModelEntry): number {
  if (a.isGroup !== b.isGroup) {
    return a.isGroup ? -1 : 1;
  }

  const provider = a.provider.localeCompare(b.provider);
  if (provider !== 0) {
    return provider;
  }

  return a.displayName.localeCompare(b.displayName);
}
