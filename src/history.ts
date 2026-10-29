import { appendFile, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';
import type { AgentType, HistoryEntry, ModelEntry } from './types.js';

const HISTORY_FILE = path.join(os.homedir(), '.magpick-history');

/**
 * Format: timestamp<TAB>agent<TAB>modelId
 */
export async function loadHistory(): Promise<HistoryEntry[]> {
  if (!existsSync(HISTORY_FILE)) {
    return [];
  }

  try {
    const content = await readFile(HISTORY_FILE, 'utf-8');
    const lines = content.split('\n').filter((line) => line.trim() !== '');

    return lines.flatMap((line) => {
      const parts = line.split('\t');
      if (parts.length !== 3) {
        return [];
      }

      const timestamp = Number.parseInt(parts[0], 10);
      const agent = parts[1];
      const modelId = parts[2];

      if (!Number.isFinite(timestamp) || (agent !== 'claude' && agent !== 'codex')) {
        return [];
      }

      return [{ agent, modelId, timestamp }];
    });
  } catch {
    return [];
  }
}

export async function saveToHistory(agent: AgentType, modelId: string): Promise<void> {
  await appendFile(HISTORY_FILE, `${Date.now()}\t${agent}\t${modelId}\n`);
}

export function sortByHistory(
  models: ModelEntry[],
  history: HistoryEntry[],
  agent: AgentType
): ModelEntry[] {
  const recent = new Map<string, number>();

  for (const entry of history) {
    if (entry.agent !== agent) {
      continue;
    }

    const previous = recent.get(entry.modelId) ?? 0;
    if (entry.timestamp > previous) {
      recent.set(entry.modelId, entry.timestamp);
    }
  }

  return [...models].sort((a, b) => {
    const aTime = recent.get(a.id) ?? 0;
    const bTime = recent.get(b.id) ?? 0;

    if (aTime !== bTime) {
      return bTime - aTime;
    }

    if (a.isGroup !== b.isGroup) {
      return a.isGroup ? -1 : 1;
    }

    const provider = a.provider.localeCompare(b.provider);
    if (provider !== 0) {
      return provider;
    }

    return a.displayName.localeCompare(b.displayName);
  });
}
