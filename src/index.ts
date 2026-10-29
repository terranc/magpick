#!/usr/bin/env node

import { spawn, execSync } from 'child_process';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { render } from 'ink';
import React from 'react';
import { Command } from 'commander';
import { App } from './ui/App.js';
import {
  assertGatewayKey,
  fetchModels,
  getGatewayKey,
  resolveGatewayUrl,
} from './gateway.js';
import { loadHistory, saveToHistory, sortByHistory } from './history.js';
import { clearClaudeSettings, createClaudeSettings } from './claude-settings.js';
import { clearCodexConfigs, createCodexConfig } from './codex-settings.js';
import type { AgentType, ModelEntry } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8')
) as { version: string };

interface CliOptions {
  clear?: boolean;
  gateway?: string;
  json?: boolean;
}

const program = new Command();

program
  .name('magpick')
  .description('Session-scoped model picker for the Magpie gateway')
  .version(pkg.version)
  .option('--clear', 'Remove magpick-generated Claude and Codex configs')
  .option('--gateway <url>', 'Magpie gateway URL (default: http://127.0.0.1:3425)')
  .option('--json', 'Print the model list as JSON without launching')
  .enablePositionalOptions();

// Default: magpick → Claude Code
program
  .allowUnknownOption()
  .allowExcessArguments()
  .passThroughOptions()
  .action(async () => {
    await runWithType('claude', stripOwnFlags(process.argv.slice(2)));
  });

program
  .command('claude')
  .description('Launch Claude Code with a Magpie model')
  .allowUnknownOption()
  .allowExcessArguments()
  .passThroughOptions()
  .action(async () => {
    const index = process.argv.indexOf('claude');
    await runWithType('claude', stripOwnFlags(process.argv.slice(index + 1)));
  });

program
  .command('codex')
  .description('Launch Codex with a Magpie model')
  .allowUnknownOption()
  .allowExcessArguments()
  .passThroughOptions()
  .action(async () => {
    const index = process.argv.indexOf('codex');
    await runWithType('codex', stripOwnFlags(process.argv.slice(index + 1)));
  });

program.parse();

async function runWithType(agent: AgentType, args: string[]): Promise<void> {
  const options = readOptions();

  try {
    if (options.clear) {
      await clearGenerated();
      return;
    }

    const gatewayUrl = resolveGatewayUrl(options.gateway);
    assertGatewayKey(gatewayUrl);

    const models = await fetchModels(gatewayUrl);
    if (models.length === 0) {
      throw new Error(
        'Magpie returned no models. Add a provider in Magpie and make sure at least one model is enabled.'
      );
    }

    // The agent is already known, so only surface models that can serve its
    // protocol. Routing groups carry no protocol of their own (Magpie picks the
    // member per request), so they always stay.
    const candidates = models.filter(
      (model) => model.isGroup || isNativeFor(agent, model)
    );

    if (candidates.length === 0) {
      throw new Error(
        `No models natively serve the ${agentLabel(agent)} API. ` +
          'Enable one in Magpie, or check that its /v1/models reports native_endpoints.'
      );
    }

    const history = await loadHistory();
    const sorted = sortByHistory(candidates, history, agent);

    if (options.json) {
      console.log(
        JSON.stringify(
          {
            agent,
            gateway: gatewayUrl,
            models: sorted,
          },
          null,
          2
        )
      );
      return;
    }

    const selected = await pickModel(agent, gatewayUrl, sorted);
    await saveToHistory(agent, selected.id);

    if (agent === 'claude') {
      await launchClaude(selected, gatewayUrl, args);
    } else {
      await launchCodex(selected, gatewayUrl, args);
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

function pickModel(
  agent: AgentType,
  gatewayUrl: string,
  models: ModelEntry[]
): Promise<ModelEntry> {
  return new Promise((resolve) => {
    const instance = render(
      React.createElement(App, {
        agent,
        gatewayUrl,
        models,
        onSelect: (model: ModelEntry) => {
          if (
            process.stdin.isTTY &&
            typeof process.stdin.setRawMode === 'function'
          ) {
            process.stdin.setRawMode(false);
          }

          instance.clear();
          instance.unmount();
          resolve(model);
        },
      })
    );
  });
}

async function launchClaude(
  model: ModelEntry,
  gatewayUrl: string,
  args: string[]
): Promise<void> {
  const settingsPath = await createClaudeSettings(
    model,
    gatewayUrl,
    getGatewayKey()
  );

  const finalArgs = [`--settings=${settingsPath}`, ...args];
  console.log(`🚀 Starting Claude Code with model: ${model.id}`);

  await spawnCli('claude', finalArgs, {
    ANTHROPIC_BASE_URL: gatewayUrl,
    ANTHROPIC_AUTH_TOKEN: getGatewayKey(),
    ANTHROPIC_MODEL: model.id,
  });
}

async function launchCodex(
  model: ModelEntry,
  gatewayUrl: string,
  args: string[]
): Promise<void> {
  const codexHome = await createCodexConfig(model, gatewayUrl, getGatewayKey());

  console.log(`🚀 Starting Codex with model: ${model.id}`);

  await spawnCli('codex', args, { CODEX_HOME: codexHome });
}

async function clearGenerated(): Promise<void> {
  const [claudeRemoved, codexRemoved] = await Promise.all([
    clearClaudeSettings(),
    clearCodexConfigs(),
  ]);
  const total = claudeRemoved + codexRemoved;

  if (total > 0) {
    console.log(`✓ Cleared ${total} magpick config(s)`);
  } else {
    console.log('No magpick configs found');
  }
}

function isNativeFor(agent: AgentType, model: ModelEntry): boolean {
  const required = agent === 'claude' ? '/v1/messages' : '/v1/responses';
  return model.nativeEndpoints.includes(required);
}

/**
 * Commander can leave global flags after the subcommand unparsed when
 * passThroughOptions is on. Read the raw argv as a fallback, but never look
 * past `--`: those arguments belong to the target CLI.
 */
function readOptions(): CliOptions {
  const parsed = program.opts<CliOptions>();
  const argv = process.argv.slice(2);
  const separator = argv.indexOf('--');
  const own = separator === -1 ? argv : argv.slice(0, separator);

  const gatewayFlag = own.indexOf('--gateway');
  const gatewayInline = own.find((arg) => arg.startsWith('--gateway='));

  return {
    clear: Boolean(parsed.clear || own.includes('--clear')),
    json: Boolean(parsed.json || own.includes('--json')),
    gateway:
      parsed.gateway ||
      (gatewayFlag >= 0 ? own[gatewayFlag + 1] : undefined) ||
      (gatewayInline ? gatewayInline.slice('--gateway='.length) : undefined),
  };
}

function stripOwnFlags(args: string[]): string[] {
  const result: string[] = [];
  let passthrough = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (passthrough) {
      result.push(arg);
      continue;
    }

    if (arg === '--') {
      passthrough = true;
      result.push(arg);
      continue;
    }

    // --native is a no-op kept for compatibility: filtering by the agent's
    // protocol is now the default, so the flag is swallowed instead of being
    // forwarded to the target CLI.
    if (arg === '--clear' || arg === '--json' || arg === '--native') {
      continue;
    }

    if (arg === '--gateway') {
      index += 1;
      continue;
    }

    if (arg.startsWith('--gateway=')) {
      continue;
    }

    result.push(arg);
  }

  return result;
}

function agentLabel(agent: AgentType): string {
  return agent === 'claude' ? 'Claude' : 'Codex';
}

/**
 * Spawn a CLI through the user's login shell so PATH is what the user expects.
 */
async function spawnCli(
  bin: string,
  args: string[],
  envVars: Record<string, string>
): Promise<import('child_process').ChildProcess> {
  const userShell = process.env.SHELL;

  let resolvedBin = bin;
  if (userShell && !bin.includes('/')) {
    try {
      const result = execSync(
        `env -i HOME="${process.env.HOME}" SHELL="${userShell}" TERM="${process.env.TERM || 'xterm-256color'}" ${userShell} -l -c 'which ${bin}'`,
        { encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] }
      ).trim();

      if (result && !result.includes('not found')) {
        resolvedBin = result;
      }
    } catch {
      // Fall through with the original name.
    }
  }

  const spawnEnv = { ...process.env, ...envVars };

  const child = userShell
    ? spawn(
        userShell,
        ['-l', '-c', 'exec "$@"', 'magpick', resolvedBin, ...args],
        { stdio: 'inherit', env: spawnEnv }
      )
    : spawn(resolvedBin, args, {
        stdio: 'inherit',
        shell: process.platform === 'win32',
        env: spawnEnv,
      });

  child.on('error', (error) => {
    console.error(`Failed to start ${bin}:`, error.message);
    console.error(`Please ensure ${bin} is installed and in your PATH.`);
    process.exit(1);
  });

  child.on('exit', (code) => {
    process.exit(code || 0);
  });

  return child;
}
